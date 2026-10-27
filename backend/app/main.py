"""Main FastAPI entrypoint for Codebase QA service."""
from __future__ import annotations

import concurrent.futures
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.config import settings

app = FastAPI(
    title="Codebase QA Backend",
    description="RAG assistant for Python repositories using AST chunking, ChromaDB, Neo4j, and LLMs.",
    version="0.1.0",
)

cors_origins = [
    origin.strip()
    for origin in settings.CORS_ORIGINS.split(",")
    if origin.strip()
]

# Configure CORS middleware using origins specified in settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router)


@app.get("/health", summary="Health check endpoint")
def health_check() -> dict[str, Any]:
    """Return health status of the service and connected dependencies."""
    errors: dict[str, str] = {}

    # 1. Neo4j connectivity check (2-second timeout)
    neo4j_ok = False
    try:
        from app.indexing.graph_store import get_driver

        driver = get_driver()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(driver.verify_connectivity)
            future.result(timeout=2.0)
        neo4j_ok = True
    except concurrent.futures.TimeoutError:
        errors["neo4j"] = "Connection to Neo4j timed out after 2 seconds"
    except Exception as exc:
        errors["neo4j"] = f"Neo4j connectivity failed: {exc}"

    # 2. ChromaDB collections check
    chroma_ok = False
    try:
        import chromadb

        chroma_path = Path(settings.CHROMA_PATH)
        if not chroma_path.is_absolute():
            chroma_path = Path.cwd() / chroma_path
        client = chromadb.PersistentClient(path=str(chroma_path))
        client.list_collections()
        chroma_ok = True
    except Exception as exc:
        errors["chroma"] = f"ChromaDB check failed: {exc}"

    # 3. LLM configuration check
    llm_configured = bool(
        settings.LLM_API_KEY and settings.LLM_API_KEY.strip()
        and settings.LLM_MODEL and settings.LLM_MODEL.strip()
    )
    if not llm_configured:
        errors["llm"] = "API key or model name is not configured"

    return {
        "status": "ok",
        "version": "0.1.0",
        "neo4j": neo4j_ok,
        "chroma": chroma_ok,
        "llm_configured": llm_configured,
        "errors": errors,
    }
