"""Smoke test for the sentence-transformers embedder."""
import numpy as np
from sentence_transformers import SentenceTransformer

from backend.app.config import settings


def main() -> None:
    model = SentenceTransformer(settings.EMBEDDING_MODEL)
    texts = [
        "A function adds two numbers.",
        "A function sums two values.",
        "The weather is sunny today.",
    ]
    embeddings = model.encode(texts, normalize_embeddings=True)

    similar_score = float(np.dot(embeddings[0], embeddings[1]))
    unrelated_score = float(np.dot(embeddings[0], embeddings[2]))

    print(f"Similar-pair cosine similarity: {similar_score:.4f}")
    print(f"Unrelated-pair cosine similarity: {unrelated_score:.4f}")

    if similar_score <= unrelated_score:
        raise SystemExit("FAIL: similar texts scored no higher than unrelated texts.")

    print("PASS: embedder smoke test")


if __name__ == "__main__":
    main()