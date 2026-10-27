import { useEffect, useRef } from "react";
import {
  Check,
  Folder,
  GitBranch,
  Plus,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import type { Repository } from "../types";

interface RepoSwitcherMenuProps {
  repos: Repository[];
  filteredRepos: Repository[];
  activeId: string;
  switcherFilter: string;
  onFilterChange: (val: string) => void;
  switcherIndex: number;
  onIndexChange: (idx: number) => void;
  onSelectRepo: (id: string) => void;
  onClose: () => void;
  onConnect: () => void;
  onReindex: () => void;
  canReindex: boolean;
  reindexing: boolean;
  activeRepo: Repository | undefined;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export default function RepoSwitcherMenu({
  repos,
  filteredRepos,
  activeId,
  switcherFilter,
  onFilterChange,
  switcherIndex,
  onIndexChange,
  onSelectRepo,
  onClose,
  onConnect,
  onReindex,
  canReindex,
  reindexing,
  activeRepo,
  triggerRef,
}: RepoSwitcherMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus search input when menu mounts
  useEffect(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  // Keep highlighted item visible when navigating with Arrow Up/Down
  useEffect(() => {
    const highlightedEl = listRef.current?.querySelector<HTMLElement>(
      `.repo-switcher-item[data-index="${switcherIndex}"]`,
    );
    highlightedEl?.scrollIntoView({ block: "nearest" });
  }, [switcherIndex]);

  // Ensure menu never overflows viewport on the right
  useEffect(() => {
    if (!menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
      const overflow = rect.right - (window.innerWidth - 12);
      menu.style.left = `-${overflow}px`;
    } else {
      menu.style.left = "0px";
    }
  }, [switcherFilter]);

  // Outside click listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, triggerRef]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredRepos.length > 0) {
        onIndexChange(switcherIndex + 1 < filteredRepos.length ? switcherIndex + 1 : 0);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredRepos.length > 0) {
        onIndexChange(switcherIndex - 1 >= 0 ? switcherIndex - 1 : filteredRepos.length - 1);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredRepos[switcherIndex]) {
        onSelectRepo(filteredRepos[switcherIndex].id);
      }
      return;
    }
  };

  return (
    <div
      ref={menuRef}
      className="repo-switcher-menu"
      role="dialog"
      aria-label="Repository switcher"
      onKeyDown={handleMenuKeyDown}
    >
      <div className="repo-switcher-search">
        <Search size={13} />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search repositories…"
          value={switcherFilter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Search repositories"
        />
        {switcherFilter && (
          <button
            type="button"
            className="ghost-button icon-button"
            style={{ padding: "2px", width: "16px", height: "16px" }}
            onClick={() => {
              onFilterChange("");
              searchInputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="repo-switcher-list"
        role="listbox"
        aria-label="Repositories"
      >
        {filteredRepos.length > 0 ? (
          filteredRepos.map((r, i) => {
            const isActive = r.id === activeId;
            const isHighlighted = i === switcherIndex;
            return (
              <button
                key={r.id}
                type="button"
                data-index={i}
                className={`repo-switcher-item ${isActive ? "active" : ""} ${isHighlighted ? "highlighted" : ""}`}
                onClick={() => onSelectRepo(r.id)}
                onMouseEnter={() => onIndexChange(i)}
                role="option"
                aria-selected={isActive}
              >
                <div className="repo-switcher-item-main">
                  <span className={`repo-switcher-dot ${r.status}`} />
                  <div className="repo-switcher-item-info">
                    <span className="repo-switcher-item-name">{r.name}</span>
                    <span className="repo-switcher-item-branch">
                      <GitBranch size={10} />
                      {r.branch}
                    </span>
                  </div>
                </div>
                <div className="repo-switcher-item-meta">
                  <span className={`state-pill ${r.status}`}>
                    <span />
                    {r.status === "ready"
                      ? "Ready"
                      : r.status === "ingesting"
                        ? "Indexing"
                        : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                  {isActive && (
                    <span className="repo-switcher-check">
                      <Check size={13} />
                    </span>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className="repo-switcher-empty">
            <Folder size={18} />
            <span>
              {repos.length === 0
                ? "No repositories yet"
                : `No repositories matching "${switcherFilter}"`}
            </span>
            {repos.length === 0 && (
              <button
                type="button"
                className="repo-switcher-empty-btn"
                onClick={() => {
                  onClose();
                  onConnect();
                }}
              >
                <Plus size={12} />
                Connect repository
              </button>
            )}
          </div>
        )}
      </div>

      <div className="repo-switcher-footer">
        <button
          type="button"
          className="repo-switcher-action-btn"
          onClick={() => {
            onClose();
            onConnect();
          }}
        >
          <Plus size={13} />
          <span>Connect repository</span>
        </button>
        <button
          type="button"
          className="repo-switcher-action-btn"
          onClick={() => {
            onClose();
            onReindex();
          }}
          disabled={!canReindex}
          title={
            !activeRepo
              ? "No repository selected"
              : !canReindex
                ? "Re-indexing is only available when ready or failed"
                : "Re-index current repository"
          }
        >
          <RotateCw size={12} className={reindexing ? "spin" : ""} />
          <span>Re-index current repository</span>
        </button>
      </div>
    </div>
  );
}
