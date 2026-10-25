"""FastAPI route definitions for repository management and QA querying."""

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from app.api.schemas import RepoCreateRequest, RepoCreateResponse
from app.ingest_service import (
    create_repo,
    get_status,
    list_repos,
    run_ingestion_task,
    update_status,
)
from app.ingestion.github_client import parse_repo_url
from app.models import RepoStatus

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

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


@router.post("/query", summary="Mock query endpoint")
def mock_query() -> dict[str, str]:
    return {"status": "mock", "message": "Query endpoint is currently mocked"}


@router.get("/code", summary="Mock code retrieval endpoint")
def mock_code() -> dict[str, str]:
    return {"status": "mock", "code": "# Code endpoint is currently mocked"}
