
"""FastAPI route definitions for repository management and QA querying."""

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status

from app.api.schemas import RepoCreateRequest, RepoCreateResponse
from app.config import settings
from app.ingest_service import (
    create_repo,
    get_status,
    list_repos,
    run_ingestion_task,
    update_status,
)
from app.ingestion.github_client import parse_repo_url
from app.models import QueryRequest, RepoStatus
from app.pipeline import run_query

router = APIRouter()


@router.post(
    "/repos",
    response_model=RepoCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Register and ingest a new repository",
)
def register_repository(
    req: RepoCreateRequest,
    background_tasks: BackgroundTasks,
) -> RepoCreateResponse:
    try:
        parse_repo_url(req.repo_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    repo_status = create_repo(req.repo_url)
    background_tasks.add_task(
        run_ingestion_task,
        source=req.repo_url,
        repo_id=repo_status.repo_id,
    )
    return RepoCreateResponse(repo_id=repo_status.repo_id)


@router.get(
    "/repos",
    response_model=list[RepoStatus],
    summary="List all registered repositories",
)
def get_all_repositories() -> list[RepoStatus]:
    return list_repos()


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
    )
    return RepoCreateResponse(repo_id=repo_id)


@router.post("/query", summary="Query a repository")
def query_repository(req: QueryRequest):
    repo_status = get_status(req.repo_id)

    if repo_status is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{req.repo_id}' not found",
        )

    if req.mode == "adaptive":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Adaptive query mode is not implemented yet",
        )

    if repo_status.state != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repository '{req.repo_id}' is not ready",
        )

    question = req.question.strip()
    if not 3 <= len(question) <= 1000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question must contain between 3 and 1000 characters",
        )

    req.question = question

    try:
        return run_query(req)
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(exc),
        ) from exc


@router.get(
    "/repos/{repo_id}/code",
    summary="Retrieve cited source code lines",
)
def get_repository_code(
    repo_id: str,
    file: str = Query(..., min_length=1),
    start: int = Query(1, ge=1),
    end: int = Query(..., ge=1),
):
    repo_status = get_status(repo_id)
    if repo_status is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found",
        )

    if repo_status.state != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repository '{repo_id}' is not ready",
        )

    if end < start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'end' must be greater than or equal to 'start'",
        )

    repo_root = (Path(settings.REPOS_DIR) / repo_id).resolve()
    requested_path = Path(file)

    if requested_path.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        )

    target = (repo_root / requested_path).resolve()

    try:
        target.relative_to(repo_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        ) from exc

    if not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    try:
        with target.open("r", encoding="utf-8", errors="replace") as source:
            lines = source.readlines()
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to read requested file",
        ) from exc

    selected = [
        {"n": line_number, "text": lines[line_number - 1].rstrip("\r\n")}
        for line_number in range(start, min(end, len(lines)) + 1)
    ]

    return {
        "repo_id": repo_id,
        "file": file,
        "start": start,
        "end": end,
        "lines": selected,
    }
