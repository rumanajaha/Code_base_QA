"""Git repository clone and fetch operations using GitPython."""
from __future__ import annotations

from pathlib import Path
import re
import git

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


def _handle_git_error(exc: git.exc.GitCommandError, repo_url: str) -> None:
    """Translate low-level GitCommandError into a clear RepositoryError."""
    stderr = (exc.stderr or "").lower()
    stdout = (exc.stdout or "").lower()
    combined = f"{stderr} {stdout}"

    if "repository not found" in combined or "not found" in combined:
        raise RepositoryError(
            f"Repository {repo_url!r} not found or is private. "
            "Please check the repository URL or ensure it is publicly accessible."
        ) from exc

    if "authentication failed" in combined or "could not read username" in combined or "permission denied" in combined:
        raise RepositoryError(
            f"Authentication failed for {repo_url!r}. "
            "The repository is private and requires authentication credentials."
        ) from exc

    if "could not resolve host" in combined or "failed to connect" in combined or "network is unreachable" in combined:
        raise RepositoryError(
            f"Network error while connecting to {repo_url!r}. "
            "Please check your internet connection."
        ) from exc

    raise RepositoryError(
        f"Git operation failed for {repo_url!r} with exit code {exc.status}: "
        f"{exc.stderr.strip() if exc.stderr else str(exc)}"
    ) from exc


def clone_or_fetch(repo_url: str, branch: str | None = None) -> Path:
    """Clone a GitHub repository using shallow clone (depth=1) or pull if already present.

    The repository is placed in settings.REPOS_DIR/<owner>__<repo>.

    Args:
        repo_url: Valid GitHub HTTPS repository URL.
        branch: Optional branch name to clone or pull.

    Returns:
        Path to the local repository directory.

    Raises:
        ValueError: If repo_url is invalid.
        RepositoryError: If cloning/pulling fails due to missing/private repo,
            network errors, or other git failures.
    """
    owner, repo_name = parse_repo_url(repo_url)

    repos_root = Path(settings.REPOS_DIR)
    dest_dir = repos_root / f"{owner}__{repo_name}"

    # If repository directory already exists, pull latest changes instead of recloning
    if dest_dir.exists() and (dest_dir / ".git").exists():
        try:
            repo = git.Repo(dest_dir)
            origin = repo.remotes.origin
            if branch:
                origin.pull(branch)
            else:
                origin.pull()
            return dest_dir
        except git.exc.GitCommandError as exc:
            _handle_git_error(exc, repo_url)
        except Exception as exc:
            raise RepositoryError(
                f"Failed to pull latest changes from {repo_url}: {exc}"
            ) from exc

    # Fresh shallow clone with depth=1
    dest_dir.parent.mkdir(parents=True, exist_ok=True)
    clone_kwargs: dict[str, object] = {"depth": 1}
    if branch:
        clone_kwargs["branch"] = branch

    try:
        git.Repo.clone_from(repo_url, dest_dir, **clone_kwargs)
        return dest_dir
    except git.exc.GitCommandError as exc:
        _handle_git_error(exc, repo_url)
    except Exception as exc:
        raise RepositoryError(
            f"Failed to clone repository from {repo_url}: {exc}"
        ) from exc

    return dest_dir
