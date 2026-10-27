import { useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  ExternalLink,
  GitBranch,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { Answer, Citation } from "../types";
export function RichText({
  text,
  onCitation,
  answer,
}: {
  text: string;
  onCitation: (c: Citation) => void;
  answer: Answer;
}) {
  return (
    <div className="answer-copy">
      {text.split("\n\n").map((paragraph, p) => (
        <p key={p}>
          {paragraph
            .split(/(\[[^\]]+:\d+-\d+\]|`[^`]+`|\*\*[^*]+\*\*)/g)
            .map((part, i) => {
              const match = part.match(/^\[([^\]]+):(\d+)-(\d+)\]$/);
              if (match) {
                const citation = answer.citations.find(
                  (c) =>
                    c.file_path === match[1] &&
                    c.start_line === +match[2] &&
                    c.end_line === +match[3],
                ) ?? {
                  file_path: match[1],
                  start_line: +match[2],
                  end_line: +match[3],
                  valid: false,
                };
                return (
                  <button
                    key={i}
                    className={`citation ${citation.valid ? "" : "invalid"}`}
                    title={
                      citation.valid
                        ? `View ${part.slice(1, -1)}`
                        : "not found in retrieved code"
                    }
                    onClick={() => onCitation(citation)}
                  >
                    {citation.valid ? (
                      <span className="citation-index">
                        {Math.max(1, answer.citations.indexOf(citation) + 1)}
                      </span>
                    ) : (
                      <TriangleAlert size={12} />
                    )}
                    <span>
                      {match[1]}:{match[2]}-{match[3]}
                    </span>
                    <ExternalLink size={10} />
                  </button>
                );
              }
              if (part.startsWith("`"))
                return <code key={i}>{part.slice(1, -1)}</code>;
              if (part.startsWith("**"))
                return <strong key={i}>{part.slice(2, -2)}</strong>;
              return <span key={i}>{part}</span>;
            })}
        </p>
      ))}
    </div>
  );
}
export default function AnswerCard({
  answer,
  onCitation,
  onInspect,
  selected,
}: {
  answer: Answer;
  onCitation: (c: Citation) => void;
  onInspect: () => void;
  selected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
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
      <div className="answer-meta">
        {answer.grounding_score !== null && (
        <button
          className={`grounding ${answer.low_confidence ? "low" : ""}`}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          title={
            answer.unsupported_items.length
              ? answer.unsupported_items
                  .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
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
          <span className="meta-tag">{answer.query_type.replace(/_/g, " ")}</span>
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
        <button
          className="icon-button small"
          onClick={copy}
          title={copied ? "Copied" : "Copy answer"}
          aria-label={copied ? "Copied answer" : "Copy answer"}
        >
          {copied ? <CheckCheck size={15} /> : <Copy size={15} />}
        </button>
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
