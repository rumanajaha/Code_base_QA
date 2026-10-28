import { useEffect, useRef, useState } from "react";
import {
  Folder,
  Github,
  Loader2,
  PanelLeftClose,
  Plus,
  RotateCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import type { Ingestion, Repository } from "../types";
import type { BackendStatus } from "../hooks/useBackendStatus";
import StatusPopover from "./StatusPopover";
import SidebarRepoCard from "./SidebarRepoCard";
import SidebarActiveRepoIndex from "./SidebarActiveRepoIndex";

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
  onIndexAnotherBranch?: (repo: Repository) => void;
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
  onIndexAnotherBranch,
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

  const filteredRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()),
  );

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
            filteredRepos.map((r) => {
              const s =
                stats[r.id] ||
                (r.files !== undefined
                  ? (r as unknown as Ingestion)
                  : undefined);
              return (
                <SidebarRepoCard
                  key={r.id}
                  repo={r}
                  isActive={r.id === activeId}
                  onSelect={() => onSelectRepo(r.id)}
                  stats={s}
                  isMenuOpen={menuRepoId === r.id}
                  onToggleMenu={() =>
                    setMenuRepoId((prev) => (prev === r.id ? null : r.id))
                  }
                  onCloseMenu={() => setMenuRepoId(null)}
                  onRequestRemove={onRequestRemove}
                  onIndexAnotherBranch={onIndexAnotherBranch}
                  menuRef={menuRef}
                />
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
          {filter && !filteredRepos.length && (
            <p className="no-results">No matching repositories.</p>
          )}

          {repo && (
            <SidebarActiveRepoIndex
              repo={repo}
              currentStats={currentStats}
              ready={ready}
              ingesting={ingesting}
              reindexing={reindexing}
              onReindex={onReindex}
              onRequestRemove={onRequestRemove}
              getElapsedSeconds={getElapsedSeconds}
              pollingPaused={pollingPaused}
              onRetryPolling={onRetryPolling}
              repoError={repoError}
              onRetryRepos={onRetryRepos}
            />
          )}
        </div>
        <div className="sidebar-bottom">
          <StatusPopover status={backendStatus} />
        </div>
      </aside>
    </>
  );
}
