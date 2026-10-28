"""Git repository clone, fetch, and branch inspection operations."""
from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess

from app.config import settings


# Pattern accepting only https://github.com/<owner>/<repo>
# Optional .git extension and optional trailing slash
_GITHUB_URL_REGEX = re.compile(
    r"^https://github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+?)(?:\.git)?/?$"
)


class RepositoryError(RuntimeError):
    """Raised when repository cloning, fetching, or access fails."""
    pass


def parse_repo_url(url: str) -> tuple[str, str]:
    """Parse and validate a GitHub repository URL.

    Accepts only URLs in the form: https://github.com/<owner>/<repo>
    (with optional .git extension or trailing slash).

    Args:
        url: The repository URL to parse.

    Returns:
        A tuple of (owner, repo_name).

    Raises:
        ValueError: If the URL is not a valid HTTPS GitHub repository URL.
    """
    if not isinstance(url, str):
        raise ValueError(f"Repository URL must be a string, got {type(url).__name__}")

    clean_url = url.strip()
    match = _GITHUB_URL_REGEX.match(clean_url)
    if not match:
        raise ValueError(
            f"Invalid GitHub URL: {clean_url!r}. "
            "Expected format: https://github.com/<owner>/<repo> "
            "(optionally ending with .git or /)"
        )

    owner, repo_name = match.group(1), match.group(2)
    if repo_name.endswith(".git"):
        repo_name = repo_name[:-4]

    if not owner or not repo_name:
        raise ValueError(f"Invalid repository owner or name in URL: {clean_url!r}")

    return owner, repo_name


def list_branches(repo_url: str) -> tuple[str, list[str]]:
    """Query remote Git repository for the default branch and branch list.

    Uses `git ls-remote --symref <url> HEAD "refs/heads/*"`.
    Returns (default_branch, branches) where default_branch is first and the rest sorted.
    """
    parse_repo_url(repo_url)

    cmd = ["git", "ls-remote", "--symref", repo_url, "HEAD", "refs/heads/*"]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    try:
        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("GitHub did not answer in time") from exc
    except Exception as exc:
        raise ValueError("Repository not found or not public") from exc

    if res.returncode != 0:
        raise ValueError("Repository not found or not public")

    default_branch: str | None = None
    branch_names: list[str] = []

    for raw_line in res.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Symref line: "ref: refs/heads/<name>\tHEAD"
        if line.startswith("ref: refs/heads/"):
            parts = line.split()
            if len(parts) >= 2 and parts[1].startswith("refs/heads/"):
                default_branch = parts[1][len("refs/heads/"):]
        elif "\trefs/heads/" in line:
            _, ref_name = line.split("\trefs/heads/", 1)
            branch_names.append(ref_name.strip())
        elif " refs/heads/" in line:
            parts = line.split()
            if len(parts) >= 2 and parts[1].startswith("refs/heads/"):
                branch_names.append(parts[1][len("refs/heads/"):].strip())

    if not default_branch:
        if "main" in branch_names:
            default_branch = "main"
        elif "master" in branch_names:
            default_branch = "master"
        elif branch_names:
            default_branch = sorted(branch_names)[0]
        else:
            default_branch = "main"

    other_branches = sorted([b for b in set(branch_names) if b != default_branch])
    branches = [default_branch] + other_branches

    return default_branch, branches


def clone_or_fetch(
    repo_url: str,
    branch: str | None = None,
    repo_id: str | None = None,
) -> Path:
    """Clone a GitHub repository branch using shallow clone or fetch + reset if present.

    The repository folder is REPOS_DIR/<repo_id>.

    Args:
        repo_url: Valid GitHub HTTPS repository URL.
        branch: Optional branch name to clone/fetch. If None, default branch is used.
        repo_id: Optional explicit repo_id destination folder name.

    Returns:
        Path to the local repository directory.

    Raises:
        ValueError: If repo_url is invalid.
        RepositoryError: If cloning/fetching fails.
    """
    owner, repo_name = parse_repo_url(repo_url)

    target_branch = branch
    if not target_branch:
        default_b, _ = list_branches(repo_url)
        target_branch = default_b

    if not repo_id:
        from app.ingest_service import make_repo_id
        repo_id = make_repo_id(owner, repo_name, branch, target_branch)

    dest_dir = Path(settings.REPOS_DIR) / repo_id
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    # If repository directory already exists with a git repository
    if dest_dir.exists() and (dest_dir / ".git").exists():
        fetch_cmd = ["git", "-C", str(dest_dir), "fetch", "--depth", "1", "origin", target_branch]
        fetch_res = subprocess.run(
            fetch_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60,
            check=False,
            env=env,
        )
        if fetch_res.returncode != 0:
            raise RepositoryError(
                f"Failed to fetch branch '{target_branch}' from {repo_url}: {fetch_res.stderr.strip()}"
            )

        reset_cmd = ["git", "-C", str(dest_dir), "reset", "--hard", "FETCH_HEAD"]
        reset_res = subprocess.run(
            reset_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
            check=False,
            env=env,
        )
        if reset_res.returncode != 0:
            raise RepositoryError(
                f"Failed to reset repository at {dest_dir}: {reset_res.stderr.strip()}"
            )
        return dest_dir

    # Fresh shallow single-branch clone
    dest_dir.parent.mkdir(parents=True, exist_ok=True)
    clone_cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        target_branch,
        repo_url,
        str(dest_dir),
    ]

    try:
        clone_res = subprocess.run(
            clone_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        raise RepositoryError("Git clone timed out") from exc
    except Exception as exc:
        raise RepositoryError(f"Failed to clone repository from {repo_url}: {exc}") from exc

    if clone_res.returncode != 0:
        stderr = (clone_res.stderr or "").lower()
        if "not found" in stderr or "could not read username" in stderr or "authentication failed" in stderr:
            raise RepositoryError(
                f"Repository {repo_url!r} not found or is private. "
                "Please check the repository URL or ensure it is publicly accessible."
            )
        if "could not resolve host" in stderr or "failed to connect" in stderr:
            raise RepositoryError(
                f"Network error while connecting to {repo_url!r}. "
                "Please check your internet connection."
            )
        raise RepositoryError(
            f"Failed to clone repository from {repo_url}: {clone_res.stderr.strip()}"
        )

    return dest_dir

