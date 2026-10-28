import { Check, GitBranch, Github, MoreHorizontal, Trash2 } from "lucide-react";
import type { Ingestion, Repository } from "../types";

interface SidebarRepoCardProps {
  repo: Repository;
  isActive: boolean;
  onSelect: () => void;
  stats?: Ingestion;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRequestRemove: (repo: Repository) => void;
  onIndexAnotherBranch?: (repo: Repository) => void;
  menuRef?: React.RefObject<HTMLDivElement | null>;
}

export default function SidebarRepoCard({
  repo,
  isActive,
  onSelect,
  stats,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onRequestRemove,
  onIndexAnotherBranch,
  menuRef,
}: SidebarRepoCardProps) {
  const isReady = repo.status === "ready";
  const isNonDefault =
    Boolean(repo.branch) &&
    !["main", "master", "default"].includes(repo.branch.toLowerCase()) &&
    (repo.id.split("__").length > 2 || !["main", "master"].includes(repo.branch.toLowerCase()));

  return (
    <div
      className="repo-card-wrapper"
      ref={isMenuOpen ? menuRef : undefined}
    >
      <button
        type="button"
        className={`repo-card ${isActive ? "active" : ""}`}
        onClick={onSelect}
        aria-pressed={isActive}
      >
        <div className="repo-card-main">
          <span className={`repo-icon ${isActive ? "active" : ""}`}>
            <Github size={18} />
          </span>
          <div>
            <strong>
              {repo.name}
              {isNonDefault && (
                <span className="branch-chip" title={`Branch: ${repo.branch}`}>
                  <GitBranch size={9} />
                  {repo.branch}
                </span>
              )}
            </strong>
            <span>
              <GitBranch size={11} />
              {repo.branch} <i />
              Python
            </span>
          </div>
          {isActive && (
            <span className="repo-selected">
              <Check size={12} />
            </span>
          )}
          <button
            type="button"
            className="repo-menu-trigger icon-button small"
            title={`Options for ${repo.name}`}
            aria-label={`Options for ${repo.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        <div className="repo-card-bottom">
          <span className={`state-pill ${repo.status}`}>
            <span />
            {repo.status === "ready"
              ? "Ready to explore"
              : repo.status === "ingesting"
                ? "Indexing"
                : repo.status.charAt(0).toUpperCase() + repo.status.slice(1)}
          </span>
          <span>{repo.demo ? "Sample repo" : repo.url.split("/")[3]}</span>
        </div>
        {isReady && stats && (
          <div className="repo-compact-stats">
            {stats.files} files · {stats.chunks} chunks · {stats.graph_nodes} graph nodes · {stats.graph_edges} edges
          </div>
        )}
      </button>
      {isMenuOpen && (
        <div className="repo-card-menu" role="menu">
          {onIndexAnotherBranch && (
            <button
              type="button"
              className="repo-card-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                onCloseMenu();
                onIndexAnotherBranch(repo);
              }}
              role="menuitem"
            >
              <GitBranch size={13} />
              <span>Index another branch…</span>
            </button>
          )}
          <button
            type="button"
            className="repo-card-menu-item danger"
            onClick={(e) => {
              e.stopPropagation();
              onCloseMenu();
              onRequestRemove(repo);
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
}
