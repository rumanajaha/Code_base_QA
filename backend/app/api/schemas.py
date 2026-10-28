"""HTTP API request and response schemas."""

from pydantic import BaseModel


class RepoCreateRequest(BaseModel):
    repo_url: str
    branch: str | None = None


class RepoCreateResponse(BaseModel):
    repo_id: str
    branch: str | None = None
    already_indexed: bool | None = None


class BranchListResponse(BaseModel):
    default_branch: str
    branches: list[str]
    truncated: bool = False
