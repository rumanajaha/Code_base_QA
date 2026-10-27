import { useState } from "react";
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
  PanelLeftClose,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import type { Ingestion, Repository } from "../types";
import type { BackendStatus } from "../hooks/useBackendStatus";
import StatusPopover from "./StatusPopover";

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
}: SidebarProps) {
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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
              .map((r) => (
                <button
                  key={r.id}
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
                </button>
              ))
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
                  <div>
                    <Loader2 className="spin" size={13} />
                    <span>
                      {currentStats?.stage || "Preparing your repository"}
                    </span>
                  </div>
                  <div
                    className={`progress-track ${currentStats?.progress === undefined ? "indeterminate" : ""}`}
                  >
                    <span
                      style={{ width: `${currentStats?.progress ?? 35}%` }}
                    />
                  </div>
                  <p>
                    {currentStats?.progress !== undefined
                      ? `${currentStats.progress}% · `
                      : ""}
                    Chat will be ready when indexing finishes.
                  </p>
                </div>
              )}
              {repo.status === "failed" && (
                <div className="ingestion-failed" role="alert">
                  <TriangleAlert size={16} />
                  <p>
                    {currentStats?.error ||
                      "Indexing failed. Please try again."}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={onReindex}
                    disabled={reindexing}
                  >
                    Retry indexing
                  </button>
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
