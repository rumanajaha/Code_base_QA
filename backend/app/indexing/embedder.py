"""Dense text embedding generation using Sentence Transformers."""

from sentence_transformers import SentenceTransformer

from app.config import settings


class Embedder:
    """Generate normalized vector embeddings for text."""

    def __init__(self, model_name: str = settings.EMBEDDING_MODEL) -> None:
        self.model = SentenceTransformer(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Encode texts in batches of 32 and normalize their embeddings."""
        if not texts:
            return []

        embeddings = self.model.encode(
            texts,
            batch_size=32,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

        return embeddings.tolist()


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    """Return the shared Embedder instance, creating it on first use."""
    global _embedder

    if _embedder is None:
        _embedder = Embedder()

    return _embedder