"""HTTP API request and response schemas."""

from pydantic import BaseModel


class RepoCreateRequest(BaseModel):
    repo_url: str
    branch: str | None = None


class RepoCreateResponse(BaseModel):
    repo_id: str
