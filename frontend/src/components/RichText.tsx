import { ExternalLink, TriangleAlert } from "lucide-react";
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
            .split(/(\[[^\]]+:\d+(?:-\d+)?\]|`[^`]+`|\*\*[^*]+\*\*)/g)
            .map((part, i) => {
              // Match range [path:10-20] or single line [path:12]
              const match = part.match(/^\[([^\]]+):(\d+)(?:-(\d+))?\]$/);
              if (match) {
                const filePath = match[1];
                const start = +match[2];
                const end = match[3] !== undefined ? +match[3] : start;
                const isSingleLine = match[3] === undefined;

                // Match against existing citations in answer
                const citation = answer.citations.find(
                  (c) =>
                    c.file_path === filePath &&
                    (isSingleLine
                      ? (c.start_line === start && c.end_line === start) ||
                        (c.start_line <= start && c.end_line >= start)
                      : c.start_line === start && c.end_line === end),
                );

                const isValid = Boolean(citation && citation.valid);
                const resolvedCitation: Citation = citation ?? {
                  file_path: filePath,
                  start_line: start,
                  end_line: end,
                  valid: false,
                };

                const displayText = isSingleLine
                  ? `${filePath}:${start}`
                  : `${filePath}:${start}-${end}`;

                return (
                  <button
                    key={i}
                    className={`citation ${isValid ? "" : "invalid"}`}
                    title={
                      isValid
                        ? `View ${displayText}`
                        : "not found in retrieved code"
                    }
                    onClick={() => onCitation(resolvedCitation)}
                  >
                    {isValid ? (
                      <span className="citation-index">
                        {Math.max(1, answer.citations.indexOf(citation!) + 1)}
                      </span>
                    ) : (
                      <TriangleAlert size={12} />
                    )}
                    <span>{displayText}</span>
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

export default RichText;
