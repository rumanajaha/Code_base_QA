import { CircleHelp, Menu, Moon, Sun } from "lucide-react";
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
  theme: string;
  onToggleTheme: () => void;
  isDemo: boolean;
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
  theme,
  onToggleTheme,
  isDemo,
}: TopbarProps) {
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
        <span
          className="avatar"
          title="Local session · no sign-in required"
        >
          J
        </span>
      </div>
    </header>
  );
}
