"""Main FastAPI entrypoint for Codebase QA service."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.config import settings

app = FastAPI(
    title="Codebase QA Backend",
    description="RAG assistant for Python repositories using AST chunking, ChromaDB, Neo4j, and LLMs.",
    version="0.1.0",
)

# Configure CORS middleware using origins specified in settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router)


@app.get("/health", summary="Health check endpoint")
def health_check() -> dict[str, str]:
    """Return health status of the service."""
    return {"status": "ok"}
