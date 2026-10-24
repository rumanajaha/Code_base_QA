"""Prompt construction for grounded codebase answers."""

from app.models import RetrievedItem


SYSTEM_PROMPT = """You are a codebase question-answering assistant.

Use only the provided code context to describe this repository.
Do not infer repository-specific behavior that is not shown.

Citation rules:
- Cite each factual statement about provided code immediately using [path:start-end].
- Copy the path and line range exactly from a context header.
- Cite only code that supports the statement.
- Do not invent citations.
- If the context is insufficient to answer the question fully, say so.
  You may still describe what the provided code does, with citations.
- Do not claim that something is absent from the entire repository merely
  because it is absent from the retrieved excerpts.
-Use ordinary square brackets only. Do not use decorative brackets such as 【】.
A correct citation looks exactly like [auth/users.py:6-8].
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