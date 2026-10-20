"""Sliding line window naive code chunker."""
from pathlib import Path

from app.models import Chunk


def _path_to_dotted_module(path: str) -> str:
    """Convert a file path to a dotted module path string.

    Examples:
        "shop/cart.py" -> "shop.cart"
        "auth/__init__.py" -> "auth"
        "config.py" -> "config"
    """
    clean = path.replace("\\", "/").strip("./")
    if clean.endswith(".py"):
        clean = clean[:-3]
    parts = clean.split("/")
    if len(parts) > 1 and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def chunk_file_naive(
    repo_id: str,
    path: str,
    source: str,
    window: int = 40,
    overlap: int = 8,
) -> list[Chunk]:
    """Split source code into fixed-size overlapping line windows.

    Rules:
    - Split source into line windows of size `window`.
    - Each successive window starts `window - overlap` lines after the previous one.
    - The final window extends to the end of the file and may be shorter than `window` lines.
    - An empty source file produces an empty list of chunks.

    Args:
        repo_id: Repository identifier.
        path: File path within the repository.
        source: Source code content as a string.
        window: Size of each window in number of lines (default: 40).
        overlap: Number of overlapping lines between consecutive windows (default: 8).

    Returns:
        List of Chunk objects with node_type="window".
    """
    if window <= 0:
        raise ValueError(f"window must be greater than 0, got {window}")
    if overlap < 0:
        raise ValueError(f"overlap must be non-negative, got {overlap}")
    if overlap >= window:
        raise ValueError(f"overlap ({overlap}) must be strictly less than window ({window})")

    lines = source.splitlines(keepends=True)
    total_lines = len(lines)
    if total_lines == 0:
        return []

    norm_path = path.replace("\\", "/")
    file_name = Path(norm_path).name
    dotted_module = _path_to_dotted_module(norm_path)
    step = window - overlap

    chunks: list[Chunk] = []
    start_idx = 0

    while start_idx < total_lines:
        end_idx = min(start_idx + window, total_lines)
        start_line = start_idx + 1
        end_line = end_idx

        window_lines = lines[start_idx:end_idx]
        code = "".join(window_lines)

        qualified_name = f"{dotted_module}:{start_line}-{end_line}"
        chunk_id = f"{repo_id}:{norm_path}:{start_line}-{end_line}"

        chunk = Chunk(
            id=chunk_id,
            repo_id=repo_id,
            file_path=norm_path,
            start_line=start_line,
            end_line=end_line,
            node_type="window",
            name=file_name,
            qualified_name=qualified_name,
            parent_name=None,
            docstring=None,
            code=code,
        )
        chunks.append(chunk)

        # Break once the window has reached the end of the file
        if end_idx >= total_lines:
            break

        start_idx += step

    return chunks
