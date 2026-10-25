"""ChromaDB vector store operations for code chunks."""

from pathlib import Path

import chromadb

from app.config import settings
from app.indexing.embedder import get_embedder
from app.models import Chunk, RetrievedItem


class VectorStore:
    """Store and retrieve repository code chunks using ChromaDB."""

    def __init__(self, repo_id: str) -> None:
        self.repo_id = repo_id

        # Resolve relative paths from the project root.
        chroma_path = Path(settings.CHROMA_PATH)
        if not chroma_path.is_absolute():
            chroma_path = Path.cwd() / chroma_path

        self.client = chromadb.PersistentClient(path=str(chroma_path))
        self.collection_name = f"repo_{repo_id}"
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(self, chunks: list[Chunk]) -> None:
        """Replace this repository's collection contents with the supplied chunks."""
        try:
            self.client.delete_collection(self.collection_name)
        except Exception:
            pass

        self.collection = self.client.create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        if not chunks:
            return

        texts = [
            f"{chunk.qualified_name}\n{chunk.docstring or ''}\n{chunk.code}"
            for chunk in chunks
        ]
        embeddings = get_embedder().embed(texts)

        self.collection.add(
            ids=[chunk.id for chunk in chunks],
            documents=texts,
            embeddings=embeddings,
            metadatas=[
                {
                    key: value
                    for key, value in chunk.model_dump().items()
                    if value is not None
                }
                for chunk in chunks
            ],
        )

    def semantic_search(self, query: str, k: int = 5) -> list[RetrievedItem]:
        """Find the most semantically similar chunks for a query."""
        if k <= 0 or self.collection.count() == 0:
            return []

        query_embedding = get_embedder().embed([query])[0]
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(k, self.collection.count()),
            include=["distances", "metadatas"],
        )

        items: list[RetrievedItem] = []
        metadatas = results["metadatas"][0] or []
        distances = results["distances"][0] or []

        for rank, (metadata, distance) in enumerate(
            zip(metadatas, distances), start=1
        ):
            chunk = Chunk.model_validate(metadata)
            items.append(
                RetrievedItem(
                    chunk=chunk,
                    score=1.0 - distance,
                    source="semantic",
                    via=None,
                    rank=rank,
                )
            )

        return items

    def collection_count(self) -> int:
        """Return the number of chunks stored for this repository."""
        return self.collection.count()

    def delete_repo(self) -> None:
        """Delete this repository's collection from ChromaDB."""
        try:
            self.client.delete_collection(self.collection_name)
        except Exception:
            pass

    def get_chunks_with_embeddings(
        self, qualified_names: list[str]
    ) -> list[tuple[Chunk, list[float]]]:
        """Fetch stored chunks and embeddings by qualified name."""
        if not qualified_names:
            return []

        results = self.collection.get(
            where={"qualified_name": {"$in": qualified_names}},
            include=["embeddings", "documents", "metadatas"],
        )

        metadatas = results.get("metadatas") or []
        embeddings = results.get("embeddings")

        if embeddings is None:
            return []

        items: list[tuple[Chunk, list[float]]] = []

        for metadata, embedding in zip(metadatas, embeddings):
            if metadata is None:
                continue

            chunk = Chunk.model_validate(metadata)
            vector = (
                embedding.tolist()
                if hasattr(embedding, "tolist")
                else list(embedding)
            )
            items.append((chunk, vector))

        return items

    def get_module_headers_for_files(
        self, file_paths: list[str]
    ) -> list[tuple[Chunk, list[float]]]:
        """Fetch module-header chunks and embeddings for the given files."""
        if not file_paths:
            return []

        results = self.collection.get(
            where={
                "$and": [
                    {"node_type": "module_header"},
                    {"file_path": {"$in": file_paths}},
                ]
            },
            include=["embeddings", "metadatas"],
        )

        metadatas = results.get("metadatas") or []
        embeddings = results.get("embeddings")

        if embeddings is None:
            return []

        items: list[tuple[Chunk, list[float]]] = []

        for metadata, embedding in zip(metadatas, embeddings):
            if metadata is None:
                continue

            chunk = Chunk.model_validate(metadata)
            vector = (
                embedding.tolist()
                if hasattr(embedding, "tolist")
                else list(embedding)
            )
            items.append((chunk, vector))

        return items