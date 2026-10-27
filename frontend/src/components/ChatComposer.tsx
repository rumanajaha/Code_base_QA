import { useState } from "react";
import { ArrowUp, Check, ChevronDown, Loader2, Sparkles } from "lucide-react";
import type { Mode, Repository } from "../types";

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

interface ChatComposerProps {
  repo: Repository | undefined;
  ready: boolean;
  ingesting: boolean;
  querying: boolean;
  busy: boolean;
  isBackendBlocked: boolean;
  backendBlockedReason: string;
  question: string;
  onQuestionChange: (q: string) => void;
  onSend: (text?: string, m?: Mode) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function ChatComposer({
  repo,
  ready,
  ingesting,
  querying,
  busy,
  isBackendBlocked,
  backendBlockedReason,
  question,
  onQuestionChange,
  onSend,
  mode,
  onModeChange,
  inputRef,
}: ChatComposerProps) {
  const [showMode, setShowMode] = useState(false);

  return (
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
              onClick={() => !querying && setShowMode(!showMode)}
              aria-label="Retrieval mode"
              aria-haspopup="menu"
              aria-expanded={showMode}
              disabled={querying}
              title={
                querying
                  ? "Mode selection is locked while a query is running"
                  : "Retrieval mode"
              }
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
  );
}
