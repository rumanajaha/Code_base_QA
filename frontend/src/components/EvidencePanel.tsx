import { Code2, Layers3, Workflow } from "lucide-react";
import type { Answer, Citation, Repository } from "../types";
import CodeViewer from "./CodeViewer";
import ProvenancePanel from "./ProvenancePanel";

interface EvidencePanelProps {
  showEvidence: boolean;
  onCloseEvidence: () => void;
  tab: "code" | "retrieval";
  onTabChange: (tab: "code" | "retrieval") => void;
  repo: Repository | undefined;
  citation: Citation | null;
  onOpenCitation: (c: Citation) => void;
  selectedAnswer: Answer | null;
  compactCode?: boolean;
}

export default function EvidencePanel({
  showEvidence,
  onCloseEvidence,
  tab,
  onTabChange,
  repo,
  citation,
  onOpenCitation,
  selectedAnswer,
  compactCode = false,
}: EvidencePanelProps) {
  if (!showEvidence) return null;

  return (
    <>
      <div
        className="drawer-backdrop evidence-backdrop"
        onClick={onCloseEvidence}
      />
      <aside className="evidence-panel panel">
        <div className="panel-title">
          <div>
            <span className="evidence-heading-icon">
              <Layers3 size={17} />
            </span>
            <h2>Evidence</h2>
          </div>
        </div>
        <div
          className="evidence-tabs"
          role="tablist"
          aria-label="Evidence view"
        >
          <button
            role="tab"
            aria-selected={tab === "code"}
            aria-controls="evidence-content"
            onClick={() => onTabChange("code")}
            className={tab === "code" ? "active" : ""}
          >
            <Code2 size={15} />
            Code
          </button>
          <button
            role="tab"
            aria-selected={tab === "retrieval"}
            aria-controls="evidence-content"
            onClick={() => onTabChange("retrieval")}
            className={tab === "retrieval" ? "active" : ""}
          >
            <Workflow size={15} />
            Retrieval
            <span className="tab-count">
              {selectedAnswer?.retrieved.length ?? 0}
            </span>
          </button>
        </div>
        <div
          id="evidence-content"
          role="tabpanel"
          className="evidence-content"
        >
          {tab === "code" ? (
            <CodeViewer
              repo={repo}
              citation={citation}
              onOpen={onOpenCitation}
              compactCode={compactCode}
            />
          ) : (
            <ProvenancePanel
              answer={selectedAnswer}
              onOpen={onOpenCitation}
            />
          )}
        </div>
        <div className="evidence-panel-footer">
          <span className="semantic-dot" />
          Semantic search
          <span className="graph-dot" />
          Dependency graph
        </div>
      </aside>
    </>
  );
}
