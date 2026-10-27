import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CircleHelp,
  Files,
  Folder,
  GitBranch,
  Github,
  Layers3,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import type { Ingestion, Repository } from "../types";
import type { BackendStatus } from "../hooks/useBackendStatus";
import StatusPopover from "./StatusPopover";

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

interface SidebarProps {
  showSidebar: boolean;
  onCloseSidebar: () => void;
  repos: Repository[];
  activeId: string;
  onSelectRepo: (id: string) => void;
  onConnect: () => void;
  loadingRepos: boolean;
  repoError: string;
  onRetryRepos: () => void;
  stats: Record<string, Ingestion>;
  reindexing: boolean;
  onReindex: () => void;
  backendStatus: BackendStatus;
  pollingPaused?: boolean;
  onRetryPolling?: () => void;
  getElapsedSeconds?: (id: string) => number;
  onRequestRemove?: (repo: Repository) => void;
}

export default function Sidebar({
  showSidebar,
  onCloseSidebar,
  repos,
  activeId,
  onSelectRepo,
  onConnect,
  loadingRepos,
  repoError,
  onRetryRepos,
  stats,
  reindexing,
  onReindex,
  backendStatus,
  pollingPaused = false,
  onRetryPolling = () => {},
  getElapsedSeconds = () => 0,
  onRequestRemove = () => {},
}: SidebarProps) {
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuRepoId, setMenuRepoId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuRepoId) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuRepoId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuRepoId(null);
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuRepoId]);

  const repo = repos.find((r) => r.id === activeId);
  const currentStats = activeId ? stats[activeId] : undefined;
  const ready = repo?.status === "ready";
  const ingesting = repo?.status === "queued" || repo?.status === "ingesting";

  return (
    <>
      {showSidebar && (
        <div
          className="drawer-backdrop sidebar-backdrop"
          onClick={onCloseSidebar}
        />
      )}
      <aside className={`sidebar panel ${showSidebar ? "sidebar-open" : ""}`}>
        <div className="panel-title">
          <div>
            <Folder size={17} />
            <h2>Repositories</h2>
            <span className="count-pill">{repos.length}</span>
          </div>
          <div>
            <button
              className="icon-button small"
              title="Search repositories"
              aria-label="Search repositories"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={16} />
            </button>
            <button
              className="icon-button small mobile-close"
              aria-label="Close repositories"
              onClick={onCloseSidebar}
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
        </div>
        <div className="sidebar-scroll">
          <button className="connect-button" onClick={onConnect}>
            <Plus size={17} />
            Connect repository
          </button>
          {searchOpen && (
            <div className="repo-search input-wrap">
              <Search size={13} />
              <input
                autoFocus
                placeholder="Find a repository…"
                aria-label="Filter repositories"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}
          <div className="section-label repository-section">
            YOUR SOURCES{" "}
            <span>
              {repos.length}{" "}
              {repos.length === 1 ? "repository" : "repositories"}
            </span>
          </div>
          {loadingRepos ? (
            <div className="sidebar-loading">
              <Loader2 className="spin" size={18} />
              Loading repositories…
            </div>
          ) : repoError && !repos.length ? (
            <div className="sidebar-error" role="alert">
              <TriangleAlert size={17} />
              <p>{repoError}</p>
              <button className="text-button" onClick={onRetryRepos}>
                Try again <RotateCw size={12} />
              </button>
            </div>
          ) : repos.length ? (
            repos
              .filter((r) =>
                r.name.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((r) => {
                const s =
                  stats[r.id] ||
                  (r.files !== undefined
                    ? (r as unknown as Ingestion)
                    : undefined);
                const isReady = r.status === "ready";
                return (
                  <div
                    key={r.id}
                    className="repo-card-wrapper"
                    ref={menuRepoId === r.id ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      className={`repo-card ${r.id === activeId ? "active" : ""}`}
                      onClick={() => onSelectRepo(r.id)}
                      aria-pressed={r.id === activeId}
                    >
                      <div className="repo-card-main">
                        <span
                          className={`repo-icon ${r.id === activeId ? "active" : ""}`}
                        >
                          <Github size={18} />
                        </span>
                        <div>
                          <strong>{r.name}</strong>
                          <span>
                            <GitBranch size={11} />
                            {r.branch} <i />
                            Python
                          </span>
                        </div>
                        {r.id === activeId && (
                          <span className="repo-selected">
                            <Check size={12} />
                          </span>
                        )}
                        <button
                          type="button"
                          className="repo-menu-trigger icon-button small"
                          title={`Options for ${r.name}`}
                          aria-label={`Options for ${r.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuRepoId((prev) =>
                              prev === r.id ? null : r.id,
                            );
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                      <div className="repo-card-bottom">
                        <span className={`state-pill ${r.status}`}>
                          <span />
                          {r.status === "ready"
                            ? "Ready to explore"
                            : r.status === "ingesting"
                              ? "Indexing"
                              : r.status.charAt(0).toUpperCase() +
                                r.status.slice(1)}
                        </span>
                        <span>
                          {r.demo ? "Sample repo" : r.url.split("/")[3]}
                        </span>
                      </div>
                      {isReady && s && (
                        <div className="repo-compact-stats">
                          {s.files} files · {s.chunks} chunks · {s.graph_nodes} graph nodes · {s.graph_edges} edges
                        </div>
                      )}
                    </button>
                    {menuRepoId === r.id && (
                      <div className="repo-card-menu" role="menu">
                        <button
                          type="button"
                          className="repo-card-menu-item danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuRepoId(null);
                            onRequestRemove(r);
                          }}
                          role="menuitem"
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
          ) : (
            <div className="no-repos">
              <Github size={26} />
              <h3>A home for your code.</h3>
              <p>
                Connect your first Python repository to start a conversation.
              </p>
            </div>
          )}
          {filter &&
            !repos.some((r) =>
              r.name.toLowerCase().includes(filter.toLowerCase()),
            ) && <p className="no-results">No matching repositories.</p>}
          {repo && (
            <>
              <div className="source-divider" />
              <div className="index-heading">
                <span className="section-label">REPOSITORY INDEX</span>
                <span className={`tiny-status ${ready ? "" : "pending"}`}>
                  {ready
                    ? "Up to date"
                    : ingesting
                      ? "In progress"
                      : "Needs attention"}
                </span>
              </div>
              <div className="index-stats">
                <div>
                  <Files size={15} />
                  <span>Python files</span>
                  <strong>{currentStats?.files ?? "—"}</strong>
                </div>
                <div>
                  <Layers3 size={15} />
                  <span>Code chunks</span>
                  <strong>{currentStats?.chunks ?? "—"}</strong>
                </div>
                <div>
                  <Workflow size={15} />
                  <span>Graph nodes</span>
                  <strong>{currentStats?.graph_nodes ?? "—"}</strong>
                </div>
                <div>
                  <GitBranch size={15} />
                  <span>Connections</span>
                  <strong>{currentStats?.graph_edges ?? "—"}</strong>
                </div>
              </div>
              {ingesting && (
                <div className="ingestion-box" role="status">
                  <div className="ingestion-stage-row">
                    <Loader2 className="spin" size={13} />
                    <span>
                      {currentStats?.stage || "Indexing"}
                      {currentStats?.progress != null
                        ? ` (${currentStats.progress}%)`
                        : ""}
                    </span>
                    <span className="ingestion-elapsed">
                      · {formatElapsed(getElapsedSeconds(repo.id))}
                    </span>
                  </div>
                  <div
                    className={`progress-track ${currentStats?.progress == null ? "indeterminate" : "determinate"}`}
                    role="progressbar"
                    aria-valuenow={currentStats?.progress ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span
                      style={{
                        width:
                          currentStats?.progress != null
                            ? `${Math.min(100, Math.max(0, currentStats.progress))}%`
                            : undefined,
                      }}
                    />
                  </div>
                  <p>Chat will be ready when indexing finishes.</p>
                  {pollingPaused && (
                    <div className="polling-paused-banner">
                      <span>Polling paused (network issues).</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={onRetryPolling}
                      >
                        <RotateCw size={12} />
                        Retry polling
                      </button>
                    </div>
                  )}
                </div>
              )}
              {repo.status === "failed" && (
                <div className="ingestion-failed" role="alert">
                  <div className="failed-header">
                    <TriangleAlert size={16} />
                    <strong>Indexing failed</strong>
                  </div>
                  {(() => {
                    const err =
                      currentStats?.error ||
                      repo.error ||
                      "Indexing failed. Please check backend logs or retry.";
                    const isLong = err.length > 90;
                    return isLong ? (
                      <details className="failed-details">
                        <summary>
                          {err.slice(0, 80)}…{" "}
                          <span className="failed-show-more">Details</span>
                        </summary>
                        <p className="failed-error-full">{err}</p>
                      </details>
                    ) : (
                      <p className="failed-error-full">{err}</p>
                    );
                  })()}
                  <div className="failed-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={onReindex}
                      disabled={reindexing}
                    >
                      <RotateCw size={13} />
                      Re-index
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => onRequestRemove(repo)}
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </div>
              )}
              {ready && (
                <div className="index-complete">
                  <ShieldCheck size={13} />
                  <span>Indexed and ready for questions</span>
                </div>
              )}
              {ready && currentStats && currentStats.unresolved_calls > 0 && (
                <details className="unresolved">
                  <summary>
                    {currentStats.unresolved_calls} unresolved calls{" "}
                    <CircleHelp size={11} />
                  </summary>
                  <p>
                    Dynamic or external calls could not be resolved. The
                    dependency graph may be incomplete.
                  </p>
                </details>
              )}
              {repoError && (
                <div className="inline-error" role="alert">
                  {repoError}
                  <button className="text-button" onClick={onRetryRepos}>
                    Retry connection
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="context-note">
            <span className="context-note-icon">
              <BookOpen size={17} />
            </span>
            <div>
              <strong>A little context goes a long way.</strong>
              <p>
                Answers grounded in your code.
                <br />
                Connections you can actually follow.
              </p>
            </div>
            <span className="note-spark">✳</span>
          </div>
          <StatusPopover status={backendStatus} />
        </div>
      </aside>
    </>
  );
}
