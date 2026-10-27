import { useState } from "react";
import { ChevronDown, ExternalLink, GitBranch } from "lucide-react";
import type { Citation, Retrieved } from "../types";

interface SourcesUsedListProps {
  retrieved: Retrieved[];
  onCitation: (c: Citation) => void;
}

export default function SourcesUsedList({
  retrieved,
  onCitation,
}: SourcesUsedListProps) {
  const [showSources, setShowSources] = useState(false);

  if (!retrieved || retrieved.length === 0) return null;

  return (
    <div className="sources-used-section">
      <button
        type="button"
        className="sources-used-toggle"
        onClick={() => setShowSources(!showSources)}
        aria-expanded={showSources}
      >
        <GitBranch size={13} />
        <span>Sources used ({retrieved.length})</span>
        <ChevronDown
          className={`sources-chevron ${showSources ? "open" : ""}`}
          size={13}
        />
      </button>
      {showSources && (
        <div className="sources-used-chips">
          {retrieved.map((r, idx) => {
            const isSingle = r.chunk.start_line === r.chunk.end_line;
            const locStr = isSingle
              ? `${r.chunk.file_path}:${r.chunk.start_line}`
              : `${r.chunk.file_path}:${r.chunk.start_line}-${r.chunk.end_line}`;
            return (
              <button
                key={`${r.chunk.id || idx}-${idx}`}
                type="button"
                className="source-chip"
                onClick={() =>
                  onCitation({
                    file_path: r.chunk.file_path,
                    start_line: r.chunk.start_line,
                    end_line: r.chunk.end_line,
                    valid: true,
                  })
                }
                title={`Inspect ${locStr} (${r.chunk.name || r.chunk.qualified_name || r.source})`}
              >
                <span className={`source-type-badge ${r.source}`}>
                  {r.source}
                </span>
                <span className="source-chip-loc">{locStr}</span>
                <ExternalLink size={10} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
