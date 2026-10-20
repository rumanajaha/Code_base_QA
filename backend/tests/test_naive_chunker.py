"""Unit tests for the naive sliding-window code chunker."""
import pytest

from app.parsing.naive_chunker import chunk_file_naive


def test_empty_file() -> None:
    """Verify that an empty string produces no chunks."""
    chunks = chunk_file_naive(
        repo_id="test_repo",
        path="shop/empty.py",
        source="",
        window=40,
        overlap=8,
    )
    assert chunks == []


def test_short_file_10_lines() -> None:
    """Verify that a 10-line file produces a single chunk containing all 10 lines."""
    lines = [f"line {i}\n" for i in range(1, 11)]
    source = "".join(lines)

    chunks = chunk_file_naive(
        repo_id="test_repo",
        path="shop/cart.py",
        source=source,
        window=40,
        overlap=8,
    )

    assert len(chunks) == 1
    c = chunks[0]
    assert c.id == "test_repo:shop/cart.py:1-10"
    assert c.repo_id == "test_repo"
    assert c.file_path == "shop/cart.py"
    assert c.start_line == 1
    assert c.end_line == 10
    assert c.node_type == "window"
    assert c.name == "cart.py"
    assert c.qualified_name == "shop.cart:1-10"
    assert c.parent_name is None
    assert c.docstring is None
    assert c.code == source


def test_exact_window_file_40_lines() -> None:
    """Verify that a file with exactly 40 lines produces exactly 1 chunk."""
    source = "".join(f"def func_{i}(): pass\n" for i in range(1, 41))

    chunks = chunk_file_naive(
        repo_id="test_repo",
        path="shop/catalog.py",
        source=source,
        window=40,
        overlap=8,
    )

    assert len(chunks) == 1
    c = chunks[0]
    assert c.start_line == 1
    assert c.end_line == 40
    assert c.qualified_name == "shop.catalog:1-40"
    assert c.id == "test_repo:shop/catalog.py:1-40"
    assert c.code == source


def test_100_line_file_known_boundaries() -> None:
    """Verify sliding window with 100 lines, window=40, overlap=8.

    With window=40 and overlap=8, step = 40 - 8 = 32:
    - Chunk 0: lines 1-40 (lines 1 to 40)
    - Chunk 1: starts at line 33 (1 + 32), ends at line 72 (40 lines)
    - Chunk 2: starts at line 65 (33 + 32), ends at line 100 (36 lines, shorter last window)
    """
    lines = [f"val_{i} = {i}\n" for i in range(1, 101)]
    source = "".join(lines)

    chunks = chunk_file_naive(
        repo_id="mini_shop",
        path="shop/orders.py",
        source=source,
        window=40,
        overlap=8,
    )

    assert len(chunks) == 3

    # Window 1: lines 1..40
    c0 = chunks[0]
    assert c0.start_line == 1
    assert c0.end_line == 40
    assert c0.qualified_name == "shop.orders:1-40"
    assert c0.id == "mini_shop:shop/orders.py:1-40"
    assert c0.name == "orders.py"
    assert c0.code == "".join(lines[0:40])

    # Window 2: lines 33..72 (overlap with Window 1: lines 33..40, 8 lines)
    c1 = chunks[1]
    assert c1.start_line == 33
    assert c1.end_line == 72
    assert c1.qualified_name == "shop.orders:33-72"
    assert c1.id == "mini_shop:shop/orders.py:33-72"
    assert c1.name == "orders.py"
    assert c1.code == "".join(lines[32:72])

    # Window 3: lines 65..100 (overlap with Window 2: lines 65..72, 8 lines; 36 lines total)
    c2 = chunks[2]
    assert c2.start_line == 65
    assert c2.end_line == 100
    assert c2.qualified_name == "shop.orders:65-100"
    assert c2.id == "mini_shop:shop/orders.py:65-100"
    assert c2.name == "orders.py"
    assert c2.code == "".join(lines[64:100])


def test_custom_window_and_overlap() -> None:
    """Verify custom window=10, overlap=3 (step = 7) on 25 lines."""
    source = "".join(f"line_{i}\n" for i in range(1, 26))

    chunks = chunk_file_naive(
        repo_id="test_repo",
        path="auth/tokens.py",
        source=source,
        window=10,
        overlap=3,
    )

    # 25 lines with step 7:
    # Window 0: start 0 -> lines 1..10
    # Window 1: start 7 -> lines 8..17
    # Window 2: start 14 -> lines 15..24
    # Window 3: start 21 -> lines 22..25 (4 lines)
    assert len(chunks) == 4
    assert (chunks[0].start_line, chunks[0].end_line) == (1, 10)
    assert (chunks[1].start_line, chunks[1].end_line) == (8, 17)
    assert (chunks[2].start_line, chunks[2].end_line) == (15, 24)
    assert (chunks[3].start_line, chunks[3].end_line) == (22, 25)
    assert chunks[0].qualified_name == "auth.tokens:1-10"
    assert chunks[3].qualified_name == "auth.tokens:22-25"


def test_dotted_module_naming_edge_cases() -> None:
    """Verify module names for package root and __init__.py files."""
    source = "FOO = 1\nBAR = 2\n"

    # Root file without directories
    root_chunks = chunk_file_naive(
        repo_id="repo",
        path="config.py",
        source=source,
    )
    assert len(root_chunks) == 1
    assert root_chunks[0].name == "config.py"
    assert root_chunks[0].qualified_name == "config:1-2"

    # Package __init__.py file
    init_chunks = chunk_file_naive(
        repo_id="repo",
        path="auth/__init__.py",
        source=source,
    )
    assert len(init_chunks) == 1
    assert init_chunks[0].name == "__init__.py"
    assert init_chunks[0].qualified_name == "auth:1-2"


def test_invalid_window_parameters() -> None:
    """Verify validation errors for invalid window and overlap configurations."""
    with pytest.raises(ValueError, match="window must be greater than 0"):
        chunk_file_naive("repo", "f.py", "a\n", window=0, overlap=0)

    with pytest.raises(ValueError, match="overlap must be non-negative"):
        chunk_file_naive("repo", "f.py", "a\n", window=10, overlap=-1)

    with pytest.raises(ValueError, match="overlap .* must be strictly less than window"):
        chunk_file_naive("repo", "f.py", "a\n", window=10, overlap=10)

    with pytest.raises(ValueError, match="overlap .* must be strictly less than window"):
        chunk_file_naive("repo", "f.py", "a\n", window=10, overlap=15)
