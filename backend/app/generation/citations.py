"""Citation extraction and validation module."""

import re

from app.models import Citation, RetrievedItem
from app.generation.prompts import CITATION_FORMAT


_CITATION_RE = re.compile(CITATION_FORMAT)


def parse_citations(text: str, items: list[RetrievedItem]) -> list[Citation]:
    """Extract citations and validate them against retrieved code chunks.

    A citation is valid only when its file exists among the retrieved items
    and its entire cited line range is contained in a retrieved chunk.
    Duplicate citations are returned only once, in first-seen order.
    """

    # Build a set of retrieved file/range pairs for validation.
    retrieved_ranges = [
        (
            item.chunk.file_path,
            item.chunk.start_line,
            item.chunk.end_line,
        )
        for item in items
    ]

    citations: list[Citation] = []
    seen: set[tuple[str, int, int]] = set()

    for match in _CITATION_RE.finditer(text):
        file_path, start_text, end_text = match.groups()
        start_line = int(start_text)
        end_line = int(end_text)

        key = (file_path, start_line, end_line)
        if key in seen:
            continue
        seen.add(key)

        # Reversed ranges are invalid; they cannot be contained in a chunk.
        valid = start_line <= end_line and any(
            file_path == retrieved_path
            and retrieved_start <= start_line
            and end_line <= retrieved_end
            for retrieved_path, retrieved_start, retrieved_end in retrieved_ranges
        )

        citations.append(
            Citation(
                file_path=file_path,
                start_line=start_line,
                end_line=end_line,
                valid=valid,
            )
        )

    return citations