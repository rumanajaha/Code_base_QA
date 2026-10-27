import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleHelp,
  Menu,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Trash2,
} from "lucide-react";
import type { Repository } from "../types";
import Brand from "./Brand";
import RepoSwitcher from "./RepoSwitcher";

interface TopbarProps {
  repos: Repository[];
  activeId: string;
  onSelectRepo: (id: string) => void;
  onConnect: () => void;
  onReindex: () => void;
  canReindex: boolean;
  reindexing: boolean;
  onOpenSidebar: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenStatus: () => void;
  onOpenClearData: () => void;
  theme: string;
  onToggleTheme: () => void;
  isDemo: boolean;
  userInitial: string;
  displayName: string;
}

export default function Topbar({
  repos,
  activeId,
  onSelectRepo,
  onConnect,
  onReindex,
  canReindex,
  reindexing,
  onOpenSidebar,
  onOpenHelp,
  onOpenSettings,
  onOpenStatus,
  onOpenClearData,
  theme,
  onToggleTheme,
  isDemo,
  userInitial,
  displayName,
}: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        avatarBtnRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button
          className="icon-button mobile-menu"
          aria-label="Open repositories"
          onClick={onOpenSidebar}
        >
          <Menu size={20} />
        </button>
        <Brand />
        <span className="brand-divider" />
        <RepoSwitcher
          repos={repos}
          activeId={activeId}
          onSelectRepo={onSelectRepo}
          onConnect={onConnect}
          onReindex={onReindex}
          canReindex={canReindex}
          reindexing={reindexing}
        />
      </div>

      <div className="topbar-actions">
        {isDemo && (
          <span className="demo-pill">
            <span />
            Demo mode
          </span>
        )}
        <button
          className="help-button"
          aria-label="Quick guide"
          onClick={onOpenHelp}
        >
          <CircleHelp size={16} />
          <span>Quick guide</span>
        </button>
        <span className="topbar-divider" />
        <button
          className="theme-button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        >
          {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
          <span>{theme === "light" ? "Light" : "Dark"}</span>
          <span className={`theme-switch ${theme === "dark" ? "is-dark" : ""}`}>
            <span />
          </span>
        </button>

        <div className="avatar-menu-container" ref={menuContainerRef}>
          <button
            ref={avatarBtnRef}
            type="button"
            className="avatar avatar-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Account menu for ${displayName || "You"}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {userInitial}
          </button>

          {menuOpen && (
            <div
              className="avatar-dropdown-menu"
              role="menu"
              aria-label="Account options"
            >
              <div className="avatar-menu-header">
                <strong>{displayName || "You"}</strong>
                <span>Local session</span>
              </div>
              <div className="avatar-menu-divider" />
              <button
                type="button"
                className="avatar-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
                role="menuitem"
              >
                <SettingsIcon size={14} />
                <span>Settings…</span>
              </button>
              <button
                type="button"
                className="avatar-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenStatus();
                }}
                role="menuitem"
              >
                <Activity size={14} />
                <span>Backend status</span>
              </button>
              <button
                type="button"
                className="avatar-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenHelp();
                }}
                role="menuitem"
              >
                <CircleHelp size={14} />
                <span>Quick guide</span>
              </button>
              <div className="avatar-menu-divider" />
              <button
                type="button"
                className="avatar-menu-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenClearData();
                }}
                role="menuitem"
              >
                <Trash2 size={14} />
                <span>Clear local data…</span>
              </button>
              <div className="avatar-menu-divider" />
              <div className="avatar-menu-version">
                Codebase Q&A Assistant · frontend v1.0
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
