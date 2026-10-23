"""Tests for the ChromaDB semantic vector store."""

from app.indexing.vector_store import VectorStore
from app.models import Chunk


def make_chunk(
    chunk_id: str,
    qualified_name: str,
    code: str,
    docstring: str = "",
) -> Chunk:
    """Build a small test chunk."""
    return Chunk(
        id=chunk_id,
        repo_id="test_repo",
        file_path="auth.py",
        start_line=1,
        end_line=5,
        node_type="function",
        name=qualified_name.split(".")[-1],
        qualified_name=qualified_name,
        docstring=docstring or None,
        code=code,
    )


def test_semantic_search_ranks_relevant_chunk_first(tmp_path, monkeypatch):
    """Password-hashing code should rank first for a password-hashing query."""
    from app.config import settings

    monkeypatch.setattr(settings, "CHROMA_PATH", str(tmp_path / "chroma"))

    chunks = [
        make_chunk(
            "hash_password",
            "auth.hash_password",
            "return bcrypt.hashpw(password.encode(), bcrypt.gensalt())",
            "Hash a user's password securely.",
        ),
        make_chunk(
            "format_price",
            "products.format_price",
            "return f'${price:.2f}'",
            "Format a product price for display.",
        ),
    ]

    store = VectorStore("test_repo")
    store.add_chunks(chunks)

    results = store.semantic_search("How are passwords hashed?", k=2)

    assert len(results) == 2
    assert results[0].chunk.qualified_name == "auth.hash_password"
    assert results[0].source == "semantic"
    assert results[0].rank == 1
    assert results[0].score is not None


def test_collection_persists_after_reopening(tmp_path, monkeypatch):
    """Chunks should still be present after creating a new store client."""
    from app.config import settings

    monkeypatch.setattr(settings, "CHROMA_PATH", str(tmp_path / "chroma"))

    store = VectorStore("persist_repo")
    store.add_chunks(
        [
            make_chunk(
                "login",
                "auth.login",
                "return verify_password(password, stored_hash)",
                "Check a submitted password against its stored hash.",
            )
        ]
    )

    reopened_store = VectorStore("persist_repo")

    assert reopened_store.collection_count() == 1