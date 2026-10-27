import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  CircleHelp,
  GitBranch,
  Github,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { Ingestion, Repository } from "../types";
import type { BackendStatus } from "../hooks/useBackendStatus";

interface ChatHeaderProps {
  repo: Repository | undefined;
  currentStats: Ingestion | undefined;
  isBackendBlocked: boolean;
  backendBlockedReason: string;
  backendStatus: BackendStatus;
  ready: boolean;
  busy: boolean;
  ingesting: boolean;
  reindexing: boolean;
  hasMessages: boolean;
  isDemo: boolean;
  showEvidence: boolean;
  onToggleEvidence: () => void;
  onNewChat: () => void;
  onExportChat: () => void;
  onReindex: () => void;
  onResetDemo: () => void;
}

export default function ChatHeader({
  repo,
  currentStats,
  isBackendBlocked,
  backendStatus,
  ready,
  busy,
  ingesting,
  reindexing,
  hasMessages,
  isDemo,
  showEvidence,
  onToggleEvidence,
  onNewChat,
  onExportChat,
  onReindex,
  onResetDemo,
}: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      {isBackendBlocked && (
        <div className="backend-warning-banner" role="alert">
          <div className="backend-warning-content">
            <TriangleAlert size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>
                {backendStatus.state === "misconfigured"
                  ? "Backend URL misconfigured:"
                  : "Backend unreachable:"}
              </strong>{" "}
              {backendStatus.message || "Cannot communicate with backend."}{" "}
              <span className="backend-warning-hints">
                (What to try: start the backend server; check VITE_API_URL; check CORS)
              </span>
            </span>
          </div>
          <button
            type="button"
            className="backend-warning-retry-btn"
            onClick={() => backendStatus.retry()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="chat-header">
        <div className="chat-header-title">
          <span className="chat-header-icon">
            <MessageSquare size={17} />
          </span>
          <div>
            <div className="chat-header-title-row">
              <h1>{repo?.name || "A new perspective on your code"}</h1>
              {repo?.url && (
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chat-repo-github-link"
                  title={`Open ${repo.name} on GitHub`}
                  aria-label={`Open ${repo.name} on GitHub in a new tab`}
                >
                  <Github size={12} />
                  <span>GitHub</span>
                  <ArrowUpRight size={11} />
                </a>
              )}
            </div>
            <span>
              {repo ? (
                <>
                  <GitBranch size={11} />
                  {repo.branch}
                  <span className="header-dot">·</span>
                  {repo.demo ? "Sample Python repository" : "Python repository"}
                  {currentStats && currentStats.unresolved_calls > 0 && (
                    <>
                      <span className="header-dot">·</span>
                      <span
                        className="unresolved-calls-badge"
                        title="Calls the parser could not resolve statically (dynamic Python). The graph only contains resolved calls."
                      >
                        <CircleHelp size={11} />
                        {currentStats.unresolved_calls} unresolved calls
                      </span>
                    </>
                  )}
                </>
              ) : (
                "Your repository, in conversation"
              )}
            </span>
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            className="icon-button"
            onClick={onNewChat}
            disabled={!ready || busy}
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus size={18} />
          </button>

          <div className="menu-container">
            <button
              className="icon-button"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Conversation options"
              aria-expanded={showMenu}
            >
              <MoreHorizontal size={20} />
            </button>
            {showMenu && (
              <>
                <div
                  className="popover-dismiss"
                  onClick={() => setShowMenu(false)}
                />
                <div className="options-menu">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onReindex();
                    }}
                    disabled={!repo || ingesting || reindexing}
                  >
                    <RotateCw size={14} />
                    Re-index repository
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onExportChat();
                    }}
                    disabled={!hasMessages}
                  >
                    <ArrowDownToLine size={14} />
                    Export conversation
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onNewChat();
                    }}
                    disabled={!hasMessages || busy}
                  >
                    <Trash2 size={14} />
                    Clear conversation
                  </button>
                  {isDemo && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onResetDemo();
                      }}
                      disabled={busy}
                    >
                      <ArrowLeft size={14} />
                      Show onboarding
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            className={`icon-button evidence-toggle ${showEvidence ? "is-active" : ""}`}
            aria-label={
              showEvidence ? "Hide evidence panel" : "Show evidence panel"
            }
            onClick={onToggleEvidence}
            title="Toggle evidence panel"
          >
            {showEvidence ? (
              <PanelRightClose size={18} />
            ) : (
              <PanelRightOpen size={18} />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
