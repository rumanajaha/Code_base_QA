"""Shared data models for Codebase QA RAG assistant."""
from typing import Literal
from pydantic import BaseModel


class Chunk(BaseModel):
    """Represents a code chunk extracted from AST or sliding window."""

    id: str
    repo_id: str
    file_path: str
    start_line: int
    end_line: int
    node_type: Literal["function", "method", "class", "module_header", "window"]
    name: str
    qualified_name: str
    parent_name: str | None = None
    docstring: str | None = None
    code: str


class Edge(BaseModel):
    """Represents a directed relationship between code entities or files."""

    repo_id: str
    source_qualified_name: str
    target_qualified_name: str
    type: Literal["CALLS", "IMPORTS", "CONTAINS"]
    resolved: bool


class RetrievedItem(BaseModel):
    """Represents an item retrieved via semantic search or graph expansion."""

    chunk: Chunk
    score: float | None = None
    source: Literal["semantic", "graph"]
    via: str | None = None  # qualified name of the seed that pulled it in, graph items only
    rank: int


class Citation(BaseModel):
    """Represents a source code citation in a generated answer."""

    file_path: str
    start_line: int
    end_line: int
    valid: bool


class Answer(BaseModel):
    """Represents an answer returned by the QA pipeline."""

    text: str
    citations: list[Citation]
    retrieved: list[RetrievedItem]
    query_type: str | None = None
    grounding_score: float | None = None
    low_confidence: bool
    unsupported_items: list[str]
    mode: Literal["baseline", "semantic", "hybrid", "adaptive"]
    latency_ms: int
    tokens_used: int | None = None


class RepoStatus(BaseModel):
    """Represents the ingestion and indexing status of a repository."""

    repo_id: str
    state: Literal["queued", "ingesting", "ready", "failed"]
    files: int = 0
    chunks: int = 0
    graph_nodes: int = 0
    graph_edges: int = 0
    unresolved_calls: int = 0
    error: str | None = None
    repo_url: str | None = None


class QueryRequest(BaseModel):
    """Request payload for querying a repository."""

    repo_id: str
    question: str
    mode: Literal["baseline", "semantic", "hybrid", "adaptive"] = "adaptive"
