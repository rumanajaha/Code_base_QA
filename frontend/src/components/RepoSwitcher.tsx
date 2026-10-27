import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Folder,
  GitBranch,
  Plus,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import type { Repository } from "../types";

interface RepoSwitcherProps {
  repos: Repository[];
  activeId: string;
  onSelectRepo: (id: string) => void;
  onConnect: () => void;
  onReindex: () => void;
  canReindex: boolean;
  reindexing: boolean;
}

export default function RepoSwitcher({
  repos,
  activeId,
  onSelectRepo,
  onConnect,
  onReindex,
  canReindex,
  reindexing,
}: RepoSwitcherProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherFilter, setSwitcherFilter] = useState("");
  const [switcherIndex, setSwitcherIndex] = useState(0);

  const switcherTriggerRef = useRef<HTMLButtonElement>(null);
  const switcherMenuRef = useRef<HTMLDivElement>(null);
  const switcherSearchRef = useRef<HTMLInputElement>(null);
  const switcherListRef = useRef<HTMLDivElement>(null);

  const activeRepo = repos.find((r) => r.id === activeId);

  const filteredSwitcherRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(switcherFilter.toLowerCase()),
  );

  const openSwitcher = () => {
    setSwitcherFilter("");
    const activeIdx = repos.findIndex((r) => r.id === activeId);
    setSwitcherIndex(activeIdx >= 0 ? activeIdx : 0);
    setSwitcherOpen(true);
  };

  const selectRepo = (id: string) => {
    onSelectRepo(id);
    setSwitcherOpen(false);
    switcherTriggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openSwitcher();
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setSwitcherOpen(false);
      switcherTriggerRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      setSwitcherOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredSwitcherRepos.length > 0) {
        setSwitcherIndex((prev) =>
          prev + 1 < filteredSwitcherRepos.length ? prev + 1 : 0,
        );
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredSwitcherRepos.length > 0) {
        setSwitcherIndex((prev) =>
          prev - 1 >= 0 ? prev - 1 : filteredSwitcherRepos.length - 1,
        );
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredSwitcherRepos[switcherIndex]) {
        selectRepo(filteredSwitcherRepos[switcherIndex].id);
      }
      return;
    }
  };

  // Focus search input when switcher menu opens
  useEffect(() => {
    if (switcherOpen) {
      requestAnimationFrame(() => {
        switcherSearchRef.current?.focus();
      });
    }
  }, [switcherOpen]);

  // Keep highlighted item visible when navigating with Arrow Up/Down
  useEffect(() => {
    if (!switcherOpen) return;
    const highlightedEl = switcherListRef.current?.querySelector<HTMLElement>(
      `.repo-switcher-item[data-index="${switcherIndex}"]`,
    );
    highlightedEl?.scrollIntoView({ block: "nearest" });
  }, [switcherIndex, switcherOpen]);

  // Ensure menu never overflows viewport on the right
  useEffect(() => {
    if (!switcherOpen || !switcherMenuRef.current) return;
    const menu = switcherMenuRef.current;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
      const overflow = rect.right - (window.innerWidth - 12);
      menu.style.left = `-${overflow}px`;
    } else {
      menu.style.left = "0px";
    }
  }, [switcherOpen, switcherFilter]);

  // Outside click listener
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        switcherMenuRef.current &&
        !switcherMenuRef.current.contains(e.target as Node) &&
        switcherTriggerRef.current &&
        !switcherTriggerRef.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [switcherOpen]);

  return (
    <div className="repo-switcher">
      <button
        ref={switcherTriggerRef}
        type="button"
        className="repo-switcher-trigger"
        onClick={() => {
          if (switcherOpen) {
            setSwitcherOpen(false);
          } else {
            openSwitcher();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={switcherOpen}
        aria-label="Select repository"
      >
        <span className={`repo-switcher-dot ${activeRepo?.status || "none"}`} />
        <span className="repo-switcher-name">
          {activeRepo?.name || "Select repository"}
        </span>
        <ChevronDown
          size={13}
          className={`repo-switcher-chevron ${switcherOpen ? "open" : ""}`}
        />
      </button>

      {switcherOpen && (
        <div
          ref={switcherMenuRef}
          className="repo-switcher-menu"
          role="dialog"
          aria-label="Repository switcher"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="repo-switcher-search">
            <Search size={13} />
            <input
              ref={switcherSearchRef}
              type="text"
              placeholder="Search repositories…"
              value={switcherFilter}
              onChange={(e) => {
                setSwitcherFilter(e.target.value);
                setSwitcherIndex(0);
              }}
              aria-label="Search repositories"
            />
            {switcherFilter && (
              <button
                type="button"
                className="ghost-button icon-button"
                style={{ padding: "2px", width: "16px", height: "16px" }}
                onClick={() => {
                  setSwitcherFilter("");
                  switcherSearchRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div
            ref={switcherListRef}
            className="repo-switcher-list"
            role="listbox"
            aria-label="Repositories"
          >
            {filteredSwitcherRepos.length > 0 ? (
              filteredSwitcherRepos.map((r, i) => {
                const isActive = r.id === activeId;
                const isHighlighted = i === switcherIndex;
                return (
                  <button
                    key={r.id}
                    type="button"
                    data-index={i}
                    className={`repo-switcher-item ${isActive ? "active" : ""} ${isHighlighted ? "highlighted" : ""}`}
                    onClick={() => selectRepo(r.id)}
                    onMouseEnter={() => setSwitcherIndex(i)}
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
                            : r.status.charAt(0).toUpperCase() +
                              r.status.slice(1)}
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
                      setSwitcherOpen(false);
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
                setSwitcherOpen(false);
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
                setSwitcherOpen(false);
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
      )}
    </div>
  );
}
