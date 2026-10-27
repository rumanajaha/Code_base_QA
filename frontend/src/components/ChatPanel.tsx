import { useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Code2,
  FileCode2,
  GitBranch,
  Github,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import type { Citation, Ingestion, Message, Mode, Repository } from "../types";
import type { BackendStatus } from "../hooks/useBackendStatus";
import AnswerCard from "./AnswerCard";

const examples = [
  {
    icon: Workflow,
    tag: "TRACE A FLOW",
    text: "How does authentication work?",
    color: "blue",
  },
  {
    icon: GitBranch,
    tag: "CONNECT THE DOTS",
    text: "Which functions depend on each other?",
    color: "green",
  },
  {
    icon: Code2,
    tag: "EXPLORE THE DETAILS",
    text: "How are passwords verified?",
    color: "peach",
  },
];

const modeOptions: { value: Mode; label: string; description: string }[] = [
  {
    value: "adaptive",
    label: "Adaptive",
    description: "Chooses the right retrieval for your question",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Semantic search + dependency graph",
  },
  { value: "semantic", label: "Semantic", description: "Find code by meaning" },
  {
    value: "baseline",
    label: "Baseline",
    description: "General knowledge, without retrieval",
  },
];

interface ChatPanelProps {
  repo: Repository | undefined;
  currentStats: Ingestion | undefined;
  messages: Message[];
  selectedAnswerId: string;
  onOpenCitation: (c: Citation, answerId?: string) => void;
  onInspectAnswer: (id: string) => void;
  showEvidence: boolean;
  onToggleEvidence: () => void;
  onNewChat: () => void;
  onExportChat: () => void;
  onReindex: () => void;
  onResetDemo: () => void;
  onConnect: () => void;
  querying: boolean;
  busy: boolean;
  ready: boolean;
  ingesting: boolean;
  reindexing: boolean;
  question: string;
  onQuestionChange: (q: string) => void;
  onSend: (text?: string, m?: Mode) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  backendStatus: BackendStatus;
  isBackendBlocked: boolean;
  backendBlockedReason: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  endRef: React.RefObject<HTMLDivElement | null>;
  isDemo: boolean;
}

export default function ChatPanel({
  repo,
  currentStats,
  messages,
  selectedAnswerId,
  onOpenCitation,
  onInspectAnswer,
  showEvidence,
  onToggleEvidence,
  onNewChat,
  onExportChat,
  onReindex,
  onResetDemo,
  onConnect,
  querying,
  busy,
  ready,
  ingesting,
  reindexing,
  question,
  onQuestionChange,
  onSend,
  mode,
  onModeChange,
  backendStatus,
  isBackendBlocked,
  backendBlockedReason,
  inputRef,
  endRef,
  isDemo,
}: ChatPanelProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showMode, setShowMode] = useState(false);

  return (
    <main className="chat-panel panel">
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
            <h1>{repo?.name || "A new perspective on your code"}</h1>
            <span>
              {repo ? (
                <>
                  <GitBranch size={11} />
                  {repo.branch}
                  <span className="header-dot">·</span>
                  {repo.demo
                    ? "Sample Python repository"
                    : "Python repository"}
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
                    disabled={!messages.length}
                  >
                    <ArrowDownToLine size={14} />
                    Export conversation
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onNewChat();
                    }}
                    disabled={!messages.length || busy}
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

      <div className="chat-content" aria-live="polite">
        {!messages.length ? (
          <div className="chat-welcome">
            <div className="welcome-art">
              <div className="art-card art-card-one">
                <FileCode2 size={23} />
                <span />
                <span />
              </div>
              <div className="art-card art-card-two">
                <GitBranch size={23} />
                <span />
                <span />
              </div>
              <div className="art-spark">
                <Sparkles size={25} />
              </div>
              <span className="art-dot one" />
              <span className="art-dot two" />
              <svg className="art-line" viewBox="0 0 200 100">
                <path d="M30 70 Q100 0 170 55" />
              </svg>
            </div>
            <span className="welcome-eyebrow">
              <span /> LESS SEARCHING. MORE UNDERSTANDING.
            </span>
            <h2>
              Your codebase,
              <br />
              <span>connected.</span>
            </h2>
            <p className="welcome-description">
              {repo
                ? "Big-picture questions. Line-by-line answers.\nMake sense of your code, one conversation at a time."
                : "Connect a Python repository. Ask a question.\nDiscover how it all fits together."}
            </p>
            {repo ? (
              <>
                <div className="repo-context">
                  <span className="context-file-icon">
                    <FileCode2 size={13} />
                  </span>
                  <span>{currentStats?.files ?? "—"} files</span>
                  <span className="context-dot">·</span>
                  <span>{currentStats?.chunks ?? "—"} code chunks</span>
                  <span className="context-dot">·</span>
                  <span>One connected picture</span>
                </div>
                <div className="suggestions-label">
                  A FEW PLACES TO START <ArrowDown size={12} />
                </div>
                <div className="suggestions">
                  {examples.map(({ icon: Icon, tag, text, color }) => (
                    <button
                      className={`suggestion ${color}`}
                      key={text}
                      disabled={!ready || querying}
                      onClick={() => onSend(text)}
                    >
                      <span className="suggestion-icon">
                        <Icon size={18} />
                      </span>
                      <span className="suggestion-copy">
                        <small>{tag}</small>
                        <strong>{text}</strong>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="onboarding-action">
                <button className="primary-button" onClick={onConnect}>
                  <Github size={17} />
                  Connect your first repository
                  <ArrowRight size={16} />
                </button>
                <span>Python repositories · No sign-in required</span>
              </div>
            )}
            <div className="welcome-trust">
              <ShieldCheck size={13} />
              <span>Built for answers you can verify.</span>
            </div>
          </div>
        ) : (
          <div className="message-list">
            <div className="conversation-start">
              <span />
              THE CONVERSATION STARTS HERE
              <span />
            </div>
            {messages.map((m) => (
              <div key={m.id} className={`message ${m.role}`}>
                {m.role === "user" ? (
                  <div className="user-message">
                    <span>{m.text}</span>
                    <span className="user-avatar">J</span>
                  </div>
                ) : m.answer ? (
                  <AnswerCard
                    answer={m.answer}
                    selected={m.id === selectedAnswerId}
                    onCitation={(c) => onOpenCitation(c, m.id)}
                    onInspect={() => onInspectAnswer(m.id)}
                  />
                ) : (
                  <div className="query-error" role="alert">
                    <TriangleAlert size={18} />
                    <div>
                      <strong>We couldn’t get that answer.</strong>
                      <p>{m.error}</p>
                      <button
                        className="text-button"
                        disabled={querying}
                        onClick={() => onSend(m.retryQuestion, m.retryMode)}
                      >
                        <RotateCw size={13} />
                        Try again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="thinking-bubble" role="status">
                <Sparkles className="thinking-spark" size={17} />
                <span>Connecting the dots</span>
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer-area">
        {ingesting && (
          <div className="composer-notice">
            <Loader2 className="spin" size={13} />
            Indexing your repository. Your conversation starts in a moment.
          </div>
        )}
        <div className={`composer ${!ready ? "disabled" : ""}`}>
          <textarea
            ref={inputRef}
            aria-label="Ask a question about your code"
            value={question}
            onChange={(e) => {
              onQuestionChange(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
            }}
            placeholder={
              ingesting
                ? "Your code is getting connected…"
                : !repo
                  ? "Connect a repository to get started…"
                  : repo.status === "failed"
                    ? "Re-index the repository to start chatting…"
                    : "Ask anything about your code…"
            }
            disabled={!ready || querying}
            rows={1}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <div className="composer-bottom">
            <div className="mode-select-wrap">
              <button
                className="mode-button"
                onClick={() => setShowMode(!showMode)}
                aria-label="Retrieval mode"
                aria-haspopup="menu"
                aria-expanded={showMode}
                disabled={querying}
              >
                <Sparkles size={14} />
                {modeOptions.find((m) => m.value === mode)?.label}
                <ChevronDown size={13} />
              </button>
              {showMode && (
                <>
                  <div
                    className="popover-dismiss"
                    onClick={() => setShowMode(false)}
                  />
                  <div className="mode-menu" role="menu">
                    <span className="section-label">RETRIEVAL MODE</span>
                    {modeOptions.map((m) => (
                      <button
                        key={m.value}
                        role="menuitemradio"
                        aria-checked={mode === m.value}
                        onClick={() => {
                          onModeChange(m.value);
                          setShowMode(false);
                        }}
                      >
                        <span>
                          <strong>
                            {m.label}
                            {m.value === "adaptive" && (
                              <small>Recommended</small>
                            )}
                          </strong>
                          <span>{m.description}</span>
                        </span>
                        {mode === m.value && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <span className="composer-hint">
              {ready ? (
                <>
                  <span className="context-ready-dot" />
                  Repository context on
                </>
              ) : (
                "Your code stays in context"
              )}
            </span>

            <button
              className="send-button"
              onClick={() => void onSend()}
              disabled={
                !ready || !question.trim() || querying || isBackendBlocked
              }
              aria-label="Send question"
              title={
                isBackendBlocked
                  ? backendBlockedReason
                  : "Send question (Enter)"
              }
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <ArrowUp size={19} />
              )}
            </button>
          </div>
        </div>
        <div className="composer-footnote">
          <span>Codebase can make mistakes. Follow the citations.</span>
          <span>
            <kbd>↵</kbd> to send
          </span>
        </div>
      </div>
    </main>
  );
}
