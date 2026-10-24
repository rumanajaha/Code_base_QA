"""Prompt construction for grounded codebase answers."""

from app.models import RetrievedItem


SYSTEM_PROMPT = """You are a codebase question-answering assistant.

Answer only using the provided code context.
Support every factual claim with a citation in the exact format [path:start-end],
using line ranges shown in the context headers.
If the context does not contain enough information, say so plainly. Do not guess.
Keep answers concise.
"""

# Keep this citation format synchronized with the parser in citations.py.
CITATION_FORMAT = r"\[([^\]:]+):(\d+)-(\d+)\]"


def build_prompt(question: str, items: list[RetrievedItem]) -> str:
    """Build a question prompt containing the retrieved code chunks."""

    context_blocks = []

    for item in items:
        chunk = item.chunk
        header = (
            f"### [{chunk.file_path}:{chunk.start_line}-{chunk.end_line}] "
            f"{chunk.qualified_name}"
        )
        context_blocks.append(f"{header}\n{chunk.code}")

    context = "\n\n".join(context_blocks)

    return f"""Code context:

{context}

Question: {question}
"""