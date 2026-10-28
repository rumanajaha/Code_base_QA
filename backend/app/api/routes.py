"""FastAPI route definitions for repository management and QA querying."""

import logging
from pathlib import Path
import time

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import JSONResponse

from app.api.schemas import BranchListResponse, RepoCreateRequest, RepoCreateResponse
from app.ingest_service import (
    create_repo,
    delete_repo,
    get_repo_root_path,
    get_status,
    list_repos,
    make_repo_id,
    run_ingestion_task,
    update_status,
)
from app.ingestion.github_client import clone_or_fetch, list_branches, parse_repo_url
from app.models import Answer, QueryRequest, RepoStatus
from app.pipeline import run_query

logger = logging.getLogger(__name__)

router = APIRouter()

_BRANCH_CACHE: dict[str, tuple[float, str, list[str]]] = {}
_BRANCH_CACHE_TTL = 60.0


def _get_branches_cached(repo_url: str) -> tuple[str, list[str]]:
    now = time.time()
    cached = _BRANCH_CACHE.get(repo_url)
    if cached:
        cached_time, default_branch, branches = cached
        if now - cached_time < _BRANCH_CACHE_TTL:
            return default_branch, branches

    default_branch, branches = list_branches(repo_url)
    _BRANCH_CACHE[repo_url] = (now, default_branch, branches)
    return default_branch, branches


@router.get(
    "/branches",
    response_model=BranchListResponse,
    summary="List branches for a GitHub repository",
)
def get_repository_branches(repo_url: str) -> BranchListResponse:
    try:
        parse_repo_url(repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    try:
        default_branch, branches = _get_branches_cached(repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    truncated = False
    if len(branches) > 200:
        truncated = True
        branches = branches[:200]

    return BranchListResponse(
        default_branch=default_branch,
        branches=branches,
        truncated=truncated,
    )


@router.post(
    "/repos",
    response_model=RepoCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Register and ingest a new repository",
)
def register_repository(
    req: RepoCreateRequest,
    background_tasks: BackgroundTasks,
):
    try:
        owner, repo_name = parse_repo_url(req.repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    try:
        default_branch, branches = _get_branches_cached(req.repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    if req.branch:
        if req.branch not in branches:
            if len(branches) <= 10:
                avail_str = ", ".join(branches)
            else:
                first_10 = ", ".join(branches[:10])
                remaining = len(branches) - 10
                avail_str = f"{first_10} (and {remaining} more)"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Branch '{req.branch}' was not found. Available branches: {avail_str}",
            )
        resolved_branch = req.branch
    else:
        resolved_branch = default_branch

    repo_id = make_repo_id(owner, repo_name, req.branch, default_branch)

    existing = get_status(repo_id)
    if existing is not None:
        if existing.state in ("queued", "ingesting"):
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={"repo_id": repo_id, "branch": resolved_branch},
            )
        if existing.state == "ready":
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content={
                    "repo_id": repo_id,
                    "branch": resolved_branch,
                    "already_indexed": True,
                },
            )
        # If existing is failed, we start a new ingestion with the same repo_id

    create_repo(req.repo_url, branch=resolved_branch, repo_id=repo_id)
    background_tasks.add_task(
        run_ingestion_task,
        source=req.repo_url,
        repo_id=repo_id,
        branch=resolved_branch,
    )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"repo_id": repo_id, "branch": resolved_branch},
    )


@router.get(
    "/repos",
    response_model=list[RepoStatus],
    summary="List all registered repositories",
)
def get_all_repositories() -> list[RepoStatus]:
    repos = list_repos()
    return repos if repos is not None else []


@router.delete(
    "/repos/{repo_id}",
    summary="Delete a repository and its indexed data",
)
def remove_repository(repo_id: str) -> dict[str, str]:
    repo_status = get_status(repo_id)
    if not repo_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found",
        )
    if repo_status.state == "ingesting":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repository '{repo_id}' is currently ingesting",
        )

    delete_repo(repo_id)
    return {"deleted": repo_id}


@router.get(
    "/repos/{repo_id}/status",
    response_model=RepoStatus,
    summary="Get status of a specific repository",
)
def get_repository_status(repo_id: str) -> RepoStatus:
    repo_status = get_status(repo_id)
    if not repo_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found",
        )
    return repo_status


@router.post(
    "/repos/{repo_id}/reindex",
    response_model=RepoCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Reindex an existing repository",
)
def reindex_repository(
    repo_id: str,
    background_tasks: BackgroundTasks,
) -> RepoCreateResponse:
    repo_status = get_status(repo_id)
    if not repo_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found",
        )

    update_status(repo_id, state="queued", error=None)
    url = repo_status.repo_url or f"https://github.com/{repo_id.replace('__', '/')}"
    background_tasks.add_task(
        run_ingestion_task,
        source=url,
        repo_id=repo_id,
        branch=repo_status.branch,
    )
    return RepoCreateResponse(repo_id=repo_id, branch=repo_status.branch)


@router.post(
    "/query",
    response_model=Answer,
    summary="Answer a question about an indexed repository",
)
def query_repository(req: QueryRequest) -> Answer:
    repo_status = get_status(req.repo_id)
    if not repo_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{req.repo_id}' not found",
        )
    if repo_status.state != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repository '{req.repo_id}' is not ready (state: '{repo_status.state}')",
        )

    try:
        return run_query(req)
    except NotImplementedError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"Mode '{req.mode}' is not implemented yet",
        )
    except Exception as exc:
        logger.exception("Error executing query for repo '%s': %s", req.repo_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error occurred while processing the query",
        )


@router.get(
    "/repos/{repo_id}/code",
    summary="Retrieve source code lines from a repository file",
)
def get_repository_code(
    repo_id: str,
    file: str,
    start: int,
    end: int,
) -> dict:
    repo_status = get_status(repo_id)
    if not repo_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found",
        )

    root_path = get_repo_root_path(repo_id)
    if not root_path or not root_path.exists():
        if repo_status.repo_url and repo_status.repo_url.startswith("https://github.com/"):
            try:
                cloned_path = clone_or_fetch(repo_status.repo_url, branch=repo_status.branch)
                if cloned_path and cloned_path.exists():
                    root_path = cloned_path
                    update_status(repo_id, root_path=str(cloned_path.resolve()))
            except Exception as e:
                logger.warning("Could not auto-restore missing repo directory for '%s': %s", repo_id, e)

    if not root_path or not root_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository root directory for '{repo_id}' not found",
        )

    if start < 1 or start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid line range: start must be >= 1 and start <= end",
        )

    if not file.endswith(".py"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .py files are allowed",
        )

    # Resolve and protect against directory traversal
    try:
        resolved = (root_path / file).resolve()
        if not resolved.is_relative_to(root_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Path traversal detected: file is outside repository root",
            )
    except (ValueError, RuntimeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal detected: file is outside repository root",
        )

    if resolved.suffix != ".py":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .py files are allowed",
        )

    if not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{file}' not found in repository",
        )

    # Cap line window at 400 lines
    if (end - start + 1) > 400:
        end = start + 399

    content = resolved.read_text(encoding="utf-8", errors="replace")
    all_lines = content.splitlines()
    total_lines = len(all_lines)

    if start > total_lines:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"start line {start} is past end of file ({total_lines} lines)",
        )

    clamped_end = min(end, total_lines)
    lines_slice = [
        {"n": line_no, "text": all_lines[line_no - 1]}
        for line_no in range(start, clamped_end + 1)
    ]

    return {
        "file": file,
        "start": start,
        "end": clamped_end,
        "lines": lines_slice,
    }
