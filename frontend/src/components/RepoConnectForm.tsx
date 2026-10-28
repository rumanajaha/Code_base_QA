import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  GitBranch,
  Github,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { api, isDemo } from "../api";
import type { Repository } from "../types";

type BranchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; defaultBranch: string; branches: string[] }
  | { status: "error"; message: string };

function parseValidUrl(raw: string): string | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProto);
    if (
      parsed.hostname !== "github.com" ||
      parsed.username ||
      parsed.password ||
      !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\.git)?\/?$/.test(parsed.pathname)
    ) {
      return null;
    }
    const cleanPath = parsed.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "");
    return `https://github.com${cleanPath}`;
  } catch {
    return null;
  }
}

export default function RepoConnectForm({
  onConnected,
  onClose,
  disabled = false,
  disabledReason,
  existingRepos = [],
  initialUrl = "",
}: {
  onConnected: (r: Repository, wasExisting?: boolean) => void;
  onClose?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  existingRepos?: Repository[];
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [branch, setBranch] = useState("");
  const [branchState, setBranchState] = useState<BranchState>({ status: "idle" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialUrl && initialUrl !== url) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  useEffect(() => {
    const targetUrl = parseValidUrl(url);
    if (!targetUrl) {
      setBranchState({ status: "idle" });
      setBranch("");
      return;
    }

    setBranchState({ status: "loading" });
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await api.branches(targetUrl, controller.signal);
        setBranchState({
          status: "loaded",
          defaultBranch: res.defaultBranch,
          branches: res.branches,
        });
        setBranch(res.defaultBranch);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Request failed";
        setBranchState({ status: "error", message: msg });
        setBranch("");
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = parseValidUrl(url);
    if (!targetUrl) {
      setError("Enter a valid URL: https://github.com/owner/repository");
      return;
    }
    setError("");

    let branchToSend = branch.trim();
    if (branchState.status === "loaded" && branchToSend === branchState.defaultBranch) {
      branchToSend = "";
    }

    const effectiveBranch =
      branchToSend ||
      (branchState.status === "loaded" ? branchState.defaultBranch : "main");

    const normalizedTarget = targetUrl.toLowerCase();
    const existing = existingRepos.find((r) => {
      const u = r.url.toLowerCase().replace(/\.git$/, "").replace(/\/$/, "");
      const rBranch = r.branch || "main";
      return u === normalizedTarget && rBranch === effectiveBranch;
    });

    if (existing) {
      onConnected(existing, true);
      return;
    }

    setLoading(true);
    try {
      const repo = await api.connect(targetUrl, branchToSend);
      onConnected(repo, repo.already_indexed ?? false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to connect. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  };

  const isBranchLoading = branchState.status === "loading";

  return (
    <form className="connect-form" onSubmit={submit}>
      <div className="connect-form-heading">
        <Github size={19} />
        <strong>Connect a repository</strong>
        {onClose && (
          <button
            className="icon-button small"
            type="button"
            aria-label="Close connect form"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <p>Bring your Python code into the conversation.</p>
      <label htmlFor="repo-url">GitHub repository URL</label>
      <div className="input-wrap">
        <Github size={14} />
        <input
          id="repo-url"
          autoFocus
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          required
          disabled={loading}
        />
      </div>
      <label htmlFor="repo-branch">
        Branch <span>(optional)</span>
      </label>
      <div className="input-wrap">
        <GitBranch size={14} />
        {branchState.status === "idle" && (
          <input
            id="repo-branch"
            value=""
            placeholder="Default branch"
            disabled
          />
        )}
        {branchState.status === "loading" && (
          <select id="repo-branch" disabled value="">
            <option value="">Loading branches…</option>
          </select>
        )}
        {branchState.status === "loaded" && (
          <select
            id="repo-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={loading}
          >
            <option value={branchState.defaultBranch}>
              {branchState.defaultBranch} (default)
            </option>
            {branchState.branches
              .filter((b) => b !== branchState.defaultBranch)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
          </select>
        )}
        {branchState.status === "error" && (
          <input
            id="repo-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="Default branch"
            disabled={loading}
          />
        )}
      </div>
      {branchState.status === "error" && (
        <div className="branch-hint">
          Couldn't load branches ({branchState.message}). You can type a branch name instead.
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {isDemo && (
        <div className="demo-connect-note">
          Demo mode simulates indexing with sample code. It does not fetch this
          repository.
        </div>
      )}
      <button
        className="primary-button"
        type="submit"
        disabled={loading || disabled || isBranchLoading}
        title={disabled ? disabledReason : undefined}
      >
        {loading ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}{" "}
        {loading ? "Connecting…" : "Connect repository"}
        {!loading && <ArrowUpRight size={14} />}
      </button>
    </form>
  );
}

