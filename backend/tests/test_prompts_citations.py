from app.generation.citations import parse_citations
from app.generation.prompts import build_prompt
from app.models import Chunk, RetrievedItem


def make_item(
    file_path: str = "src/example.py",
    start_line: int = 10,
    end_line: int = 20,
) -> RetrievedItem:
    chunk = Chunk(
        id="chunk-1",
        repo_id="repo-1",
        file_path=file_path,
        start_line=start_line,
        end_line=end_line,
        node_type="function",
        name="example",
        qualified_name="example",
        code="def example():\n    return True",
    rank=1,
    source="semantic",
        score=0.9,
    )
    return RetrievedItem(
        chunk=chunk,
        rank=1,
        source="semantic",
        score=0.9,
    )


def test_parse_two_valid_citations():
    items = [make_item()]

    citations = parse_citations(
        "It returns true [src/example.py:10-12]. "
        "It is a function [src/example.py:15-20].",
        items,
    )

    assert len(citations) == 2
    assert all(citation.valid for citation in citations)


def test_citation_file_not_retrieved_is_invalid():
    citations = parse_citations(
        "See [src/missing.py:10-12].",
        [make_item()],
    )

    assert len(citations) == 1
    assert citations[0].valid is False


def test_partially_out_of_range_citation_is_invalid():
    citations = parse_citations(
        "See [src/example.py:18-25].",
        [make_item(start_line=10, end_line=20)],
    )

    assert len(citations) == 1
    assert citations[0].valid is False


def test_malformed_citations_are_handled():
    citations = parse_citations(
        "Malformed: [src/example.py:12], "
        "[src/example.py:x-20], [src/example.py:20-10].",
        [make_item()],
    )

    # The single-line and non-numeric formats don't match the regex.
    # The reversed range matches but is marked invalid.
    assert len(citations) == 1
    assert citations[0].valid is False


def test_duplicate_citations_are_deduplicated():
    citations = parse_citations(
        "[src/example.py:10-12] and again [src/example.py:10-12].",
        [make_item()],
    )

    assert len(citations) == 1


def test_build_prompt_includes_header_code_and_question():
    prompt = build_prompt("What does example do?", [make_item()])

    assert "### [src/example.py:10-20] example" in prompt
    assert "def example():" in prompt
    assert "Question: What does example do?" in prompt