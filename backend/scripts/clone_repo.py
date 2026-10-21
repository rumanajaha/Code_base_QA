"""CLI script to shallow-clone/pull a GitHub repo and report discovered source files.

Usage:
    python backend/scripts/clone_repo.py <github_repo_url> [branch]

Example:
    python backend/scripts/clone_repo.py https://github.com/pallets/flask
"""
from __future__ import annotations

from pathlib import Path
import sys

# Ensure backend directory is in sys.path when running script directly
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.ingestion.file_filter import list_source_files
from app.ingestion.github_client import RepositoryError, clone_or_fetch


def main() -> None:
    """Clone or fetch repository and display path and source file count."""
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: python backend/scripts/clone_repo.py <github_repo_url> [branch]")
        print("Example: python backend/scripts/clone_repo.py https://github.com/pallets/flask")
        sys.exit(0 if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help") else 1)

    repo_url = sys.argv[1]
    branch = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"Cloning/fetching repository: {repo_url} (shallow depth=1)...")
    try:
        local_path = clone_or_fetch(repo_url, branch=branch)
        source_files = list_source_files(local_path)

        print("\n--- Summary ---")
        print(f"Local path: {local_path}")
        print(f"Source files found: {len(source_files)}")

        # Print preview of first few files if available
        if source_files:
            print("\nPreview of discovered Python files:")
            for sample in source_files[:10]:
                print(f"  - {sample}")
            if len(source_files) > 10:
                print(f"  ... and {len(source_files) - 10} more.")

    except ValueError as err:
        print(f"URL Error: {err}", file=sys.stderr)
        sys.exit(1)
    except RepositoryError as err:
        print(f"Repository Error: {err}", file=sys.stderr)
        sys.exit(1)
    except Exception as err:
        print(f"Unexpected Error: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
