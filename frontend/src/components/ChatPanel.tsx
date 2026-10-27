import { useEffect } from "react";
import { CircleHelp, Sparkles, TriangleAlert } from "lucide-react";
import type { Citation, Ingestion, Message, Mode, Repository } from "../types";
import type { BackendStatus } from "../hooks/useBackendStatus";
import AnswerCard from "./AnswerCard";
import ChatHeader from "./ChatHeader";
import ChatWelcome from "./ChatWelcome";
import ChatComposer from "./ChatComposer";
import QueryErrorCard from "./QueryErrorCard";

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
  userInitial?: string;
  elapsedQuerySeconds?: number;
  onCancelQuery?: () => void;
  onReloadRepos?: () => void;
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
  userInitial = "U",
  elapsedQuerySeconds = 0,
  onCancelQuery,
  onReloadRepos,
}: ChatPanelProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputRef]);

  return (
    <main className="chat-panel panel">
      <ChatHeader
        repo={repo}
        currentStats={currentStats}
        isBackendBlocked={isBackendBlocked}
        backendBlockedReason={backendBlockedReason}
        backendStatus={backendStatus}
        ready={ready}
        busy={busy}
        ingesting={ingesting}
        reindexing={reindexing}
        hasMessages={messages.length > 0}
        isDemo={isDemo}
        showEvidence={showEvidence}
        onToggleEvidence={onToggleEvidence}
        onNewChat={onNewChat}
        onExportChat={onExportChat}
        onReindex={onReindex}
        onResetDemo={onResetDemo}
      />

      <div className="chat-content" aria-live="polite">
        {!messages.length ? (
          <ChatWelcome
            repo={repo}
            currentStats={currentStats}
            ready={ready}
            querying={querying}
            onSend={onSend}
            onConnect={onConnect}
          />
        ) : (
          <div className="message-list">
            <div className="conversation-start">
              <span />
              THE CONVERSATION STARTS HERE
              <span />
            </div>
            {currentStats && currentStats.unresolved_calls > 0 && (
              <div className="conversation-unresolved-banner">
                <span
                  className="unresolved-calls-badge"
                  title="Calls the parser could not resolve statically (dynamic Python). The graph only contains resolved calls."
                >
                  <CircleHelp size={12} />
                  {currentStats.unresolved_calls} unresolved calls
                </span>
                <span className="unresolved-hint">
                  Calls the parser could not resolve statically (dynamic Python). The graph only contains resolved calls.
                </span>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`message ${m.role}`}>
                {m.role === "user" ? (
                  <div className="user-message">
                    <span>{m.text}</span>
                    <span className="user-avatar">{userInitial || "U"}</span>
                  </div>
                ) : m.answer ? (
                  <AnswerCard
                    answer={m.answer}
                    selected={m.id === selectedAnswerId}
                    onCitation={(c) => onOpenCitation(c, m.id)}
                    onInspect={() => onInspectAnswer(m.id)}
                    onAskAgainInMode={(newMode) => {
                      const q = messages
                        .slice(0, messages.findIndex((msg) => msg.id === m.id))
                        .reverse()
                        .find((msg) => msg.role === "user")?.text;
                      if (q) {
                        onSend(q, newMode);
                      }
                    }}
                    querying={querying}
                  />
                ) : (
                  <QueryErrorCard
                    message={m}
                    repo={repo}
                    querying={querying}
                    onSend={onSend}
                    onQuestionChange={onQuestionChange}
                    onReloadRepos={onReloadRepos}
                    inputRef={inputRef}
                  />
                )}
              </div>
            ))}
            {busy && (
              <div className="thinking-bubble" role="status">
                <div className="thinking-bubble-header">
                  <Sparkles className="thinking-spark" size={17} />
                  <span>Connecting the dots ({elapsedQuerySeconds}s)</span>
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {onCancelQuery && (
                    <button
                      type="button"
                      className="cancel-query-btn"
                      onClick={onCancelQuery}
                      title="Abort query and restore question into input box"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {elapsedQuerySeconds >= 15 && (
                  <div className="thinking-rate-limit-warning">
                    <TriangleAlert size={14} />
                    <span>
                      Still working. The language model may be rate-limited; this can take up to a few minutes.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <ChatComposer
        repo={repo}
        ready={ready}
        ingesting={ingesting}
        querying={querying}
        busy={busy}
        isBackendBlocked={isBackendBlocked}
        backendBlockedReason={backendBlockedReason}
        question={question}
        onQuestionChange={onQuestionChange}
        onSend={onSend}
        mode={mode}
        onModeChange={onModeChange}
        inputRef={inputRef}
      />
    </main>
  );
}
