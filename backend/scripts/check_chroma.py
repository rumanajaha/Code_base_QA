"""Smoke test for persistent Chroma storage."""
import uuid

import chromadb

from backend.app.config import settings


def main() -> None:
    client = chromadb.PersistentClient(path=settings.CHROMA_PATH)
    collection_name = f"smoke_{uuid.uuid4().hex[:8]}"
    collection = client.create_collection(collection_name)

    try:
        collection.add(
            ids=["doc1", "doc2", "doc3"],
            documents=[
                "Python functions and classes",
                "Python code and methods",
                "A recipe for vegetable soup",
            ],
        )
        result = collection.query(
            query_texts=["Python programming"],
            n_results=2,
        )

        ids = result.get("ids", [[]])[0]
        if not ids:
            raise RuntimeError("Chroma query returned no documents.")

        print(f"Chroma query returned IDs: {ids}")
        print("PASS: Chroma smoke test")
    finally:
        client.delete_collection(collection_name)


if __name__ == "__main__":
    main()