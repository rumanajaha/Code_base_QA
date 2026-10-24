"""End-to-end question answering pipelines across retrieval modes."""

import time

from app.generation.citations import parse_citations
from app.generation.llm_client import generate
from app.generation.prompts import SYSTEM_PROMPT, build_prompt
from app.indexing.vector_store import VectorStore
from app.models import Answer, QueryRequest


BASELINE_SYSTEM_PROMPT = (
    "You are answering a question about a software repository. "
    "You have not been given any of its source code, so answer only from "
    "general programming knowledge. Do not claim to know repository-specific "
    "implementation details. Be clear when you cannot determine the answer."
)


def answer_baseline(repo_id: str, question: str) -> Answer:
    """Answer without retrieving repository code."""
    started = time.perf_counter()

    text, tokens_used = generate(
        prompt=question,
        system=BASELINE_SYSTEM_PROMPT,
    )

    elapsed_ms = round((time.perf_counter() - started) * 1000)

    return Answer(
        text=text,
        citations=[],
        retrieved=[],
        low_confidence=False,
        unsupported_items=[],
        mode="baseline",
        latency_ms=elapsed_ms,
        tokens_used=tokens_used,
    )


def answer_semantic(
    repo_id: str,
    question: str,
    k: int = 5,
) -> Answer:
    """Retrieve relevant code chunks and answer using those chunks."""
    started = time.perf_counter()

    store = VectorStore(repo_id)
    retrieved = store.semantic_search(question, k=k)

    prompt = build_prompt(question, retrieved)
    text, tokens_used = generate(
        prompt=prompt,
        system=SYSTEM_PROMPT,
    )

    citations = parse_citations(text, retrieved)
    elapsed_ms = round((time.perf_counter() - started) * 1000)

    return Answer(
        text=text,
        citations=citations,
        retrieved=retrieved,
        low_confidence=False,
        unsupported_items=[],
        mode="semantic",
        latency_ms=elapsed_ms,
        tokens_used=tokens_used,
    )


def answer_hybrid(repo_id: str, question: str, k: int = 5) -> Answer:
    """Hybrid retrieval pipeline; implementation will be added later."""
    raise NotImplementedError("Hybrid pipeline has not been implemented yet")


def answer_adaptive(repo_id: str, question: str, k: int = 5) -> Answer:
    """Adaptive retrieval pipeline; implementation will be added later."""
    raise NotImplementedError("Adaptive pipeline has not been implemented yet")


def run_query(req: QueryRequest) -> Answer:
    """Dispatch a query to the pipeline selected in the request."""
    if req.mode == "baseline":
        return answer_baseline(req.repo_id, req.question)

    if req.mode == "semantic":
        return answer_semantic(req.repo_id, req.question)

    if req.mode == "hybrid":
        return answer_hybrid(req.repo_id, req.question)

    if req.mode == "adaptive":
        return answer_adaptive(req.repo_id, req.question)

    raise ValueError(f"Unsupported query mode: {req.mode}")