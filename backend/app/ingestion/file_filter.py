"""Source file discovery and filtering utilities."""
from __future__ import annotations

import os
from pathlib import Path

from app.config import settings

# Directories to skip when scanning a repository for source files
IGNORED_DIRS = {
    ".git",
    "venv",
    ".venv",
    "node_modules",
    "__pycache__",
    "build",
    "dist",
    "site-packages",
}


def list_source_files(root: Path | str) -> list[Path]:
    """Find and return all Python source files under the given root directory.

    Rules:
    - Include .py files only.
    - Skip ignored directories (.git, venv, .venv, node_modules, __pycache__,
      build, dist, site-packages).
    - Skip files with size exceeding settings.MAX_FILE_BYTES.
    - Return paths relative to root, sorted alphabetically.

    Args:
        root: Root directory Path or path string.

    Returns:
        Sorted list of relative Path objects.

    Raises:
        ValueError: If the root path does not exist or is not a directory.
    """
    root_path = Path(root).resolve()
    if not root_path.exists() or not root_path.is_dir():
        raise ValueError(f"Root path does not exist or is not a directory: {root}")

    source_files: list[Path] = []

    for current_root, dirnames, filenames in os.walk(root_path):
        # Prune ignored directory trees in-place so os.walk does not descend into them
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]

        curr_dir = Path(current_root)
        rel_dir = curr_dir.relative_to(root_path)

        # Extra safety check against ignored directory path components
        if any(part in IGNORED_DIRS for part in rel_dir.parts):
            continue

        for fname in filenames:
            if not fname.endswith(".py"):
                continue

            file_path = curr_dir / fname
            try:
                # Exclude files larger than the configured byte limit
                if file_path.stat().st_size <= settings.MAX_FILE_BYTES:
                    source_files.append(file_path.relative_to(root_path))
            except OSError:
                # Skip unreadable files or broken symlinks
                continue

    return sorted(source_files)
