import { useState } from "react";
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
export default function RepoConnectForm({
  onConnected,
  onClose,
}: {
  onConnected: (r: Repository) => void;
  onClose?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
      if (
        parsed.hostname !== "github.com" ||
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/.test(parsed.pathname)
      )
        throw new Error();
    } catch {
      setError("Enter a valid URL: https://github.com/owner/repository");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const repo = await api.connect(
        `https://github.com${parsed.pathname.replace(/\/$/, "")}`,
        branch.trim(),
      );
      onConnected(repo);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to connect. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  };
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
        <input
          id="repo-branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="Default branch"
          disabled={loading}
        />
      </div>
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
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}{" "}
        {loading ? "Connecting…" : "Connect repository"}
        {!loading && <ArrowUpRight size={14} />}
      </button>
    </form>
  );
}
