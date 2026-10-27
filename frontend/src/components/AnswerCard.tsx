import { useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  FileText,
  GitBranch,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { Answer, Citation, Mode } from "../types";
import RichText from "./RichText";
import SourcesUsedList from "./SourcesUsedList";

export { RichText };

const ALL_MODES: { value: Mode; label: string; desc: string }[] = [
  { value: "hybrid", label: "Hybrid", desc: "Best of both: semantic search + call graph" },
  { value: "semantic", label: "Semantic", desc: "Embeddings only; pure vector search" },
  { value: "adaptive", label: "Adaptive", desc: "Auto-routes based on question type" },
  { value: "baseline", label: "Baseline", desc: "BM25 keyword search" },
];

export default function AnswerCard({
  answer,
  onCitation,
  onInspect,
  selected,
  onAskAgainInMode,
  querying = false,
}: {
  answer: Answer;
  onCitation: (c: Citation) => void;
  onInspect: () => void;
  selected: boolean;
  onAskAgainInMode?: (mode: Mode) => void;
  querying?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);

  const copyPlain = async () => {
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 1800);
    } catch {
      setCopiedText(false);
    }
  };

  const copyMarkdown = async () => {
    try {
      let md = answer.text;
      if (answer.citations && answer.citations.length > 0) {
        md += "\n\n### Sources Used\n";
        answer.citations.forEach((c, idx) => {
          const loc =
            c.start_line === c.end_line
              ? `${c.file_path}:${c.start_line}`
              : `${c.file_path}:${c.start_line}-${c.end_line}`;
          md += `${idx + 1}. \`${loc}\`${c.valid ? "" : " *(unverified)*"}\n`;
        });
      }
      await navigator.clipboard.writeText(md.trim());
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 1800);
    } catch {
      setCopiedMd(false);
    }
  };

  const otherModes = ALL_MODES.filter((m) => m.value !== answer.mode);

  return (
    <article className={`answer-card ${selected ? "selected-answer" : ""}`}>
      <div className="assistant-heading">
        <span className="mini-brand">
          <span>c</span>
          <span>↗</span>
        </span>
        <span>Codebase</span>
        <span className="answer-label">REPOSITORY ANSWER</span>
      </div>

      <RichText text={answer.text} answer={answer} onCitation={onCitation} />

      {/* Collapsible Sources used section */}
      <SourcesUsedList
        retrieved={answer.retrieved}
        onCitation={onCitation}
      />

      <div className="answer-meta">
        {answer.grounding_score !== null && (
          <button
            className={`grounding ${answer.low_confidence ? "low" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            title={
              answer.unsupported_items.length
                ? answer.unsupported_items
                    .map((x) =>
                      typeof x === "string" ? x : JSON.stringify(x),
                    )
                    .join("\n")
                : "All cited claims are supported by retrieved code."
            }
          >
            {answer.low_confidence ? (
              <TriangleAlert size={13} />
            ) : (
              <ShieldCheck size={13} />
            )}{" "}
            {answer.low_confidence ? "Low confidence" : "Grounded"}{" "}
            {answer.grounding_score.toFixed(2)}
            <ChevronDown size={12} />
          </button>
        )}
        {answer.query_type && (
          <span className="meta-tag">
            {answer.query_type.replace(/_/g, " ")}
          </span>
        )}
        <span className="meta-tag">
          <Zap size={11} />
          {answer.mode}
        </span>
        <span className="latency">
          {(answer.latency_ms / 1000).toFixed(2)}s
        </span>
      </div>

      {expanded && answer.grounding_score !== null && (
        <div
          className={`grounding-detail ${answer.low_confidence ? "low-detail" : ""}`}
        >
          <strong>
            {answer.low_confidence
              ? "Review this answer carefully"
              : "Evidence you can verify"}
          </strong>
          {answer.unsupported_items.length ? (
            <ul>
              {answer.unsupported_items.map((x, i) => (
                <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>
              ))}
            </ul>
          ) : (
            <p>
              All cited claims are supported by the retrieved code. Click a
              citation to inspect the exact lines.
            </p>
          )}
          {answer.tokens_used !== null && (
            <span>{answer.tokens_used.toLocaleString()} tokens used</span>
          )}
        </div>
      )}

      <div className="answer-actions">
        <button className="text-button" onClick={onInspect}>
          <GitBranch size={14} /> {answer.retrieved.length} sources retrieved{" "}
          <span>↗</span>
        </button>

        <div className="answer-action-buttons">
          {/* Copy plain answer */}
          <button
            className="icon-button small"
            onClick={copyPlain}
            title={copiedText ? "Copied" : "Copy answer"}
            aria-label={copiedText ? "Copied answer" : "Copy answer"}
          >
            {copiedText ? <CheckCheck size={14} /> : <Copy size={14} />}
          </button>

          {/* Copy as Markdown */}
          <button
            className="icon-button small"
            onClick={copyMarkdown}
            title={
              copiedMd
                ? "Copied Markdown"
                : "Copy as Markdown (with citations)"
            }
            aria-label={
              copiedMd
                ? "Copied Markdown"
                : "Copy as Markdown including citations"
            }
          >
            {copiedMd ? <CheckCheck size={14} /> : <FileText size={14} />}
          </button>

          {/* Ask again in another mode */}
          {onAskAgainInMode && (
            <div className="ask-again-wrap">
              <button
                className="text-button small ask-again-trigger"
                onClick={() => setShowModeMenu(!showModeMenu)}
                disabled={querying}
                title="Ask this question again in another retrieval mode"
                aria-haspopup="menu"
                aria-expanded={showModeMenu}
              >
                <RotateCw size={12} />
                <span>Ask again in…</span>
                <ChevronDown size={11} />
              </button>
              {showModeMenu && (
                <>
                  <div
                    className="popover-dismiss"
                    onClick={() => setShowModeMenu(false)}
                  />
                  <div className="ask-again-menu" role="menu">
                    <span className="ask-again-header">ASK IN ANOTHER MODE</span>
                    {otherModes.map((m) => (
                      <button
                        key={m.value}
                        role="menuitem"
                        className="ask-again-item"
                        onClick={() => {
                          setShowModeMenu(false);
                          onAskAgainInMode(m.value);
                        }}
                      >
                        <strong>{m.label}</strong>
                        <small>{m.desc}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {answer.grounding_score !== null && (
          <span className="answer-verified">
            <Check size={12} />{" "}
            {answer.low_confidence ? "Review recommended" : "Citations checked"}
          </span>
        )}
      </div>
    </article>
  );
}
