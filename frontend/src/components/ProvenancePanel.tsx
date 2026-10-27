import {
  ArrowDown,
  ArrowUpRight,
  GitBranch,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { Answer, Citation } from "../types";
export default function ProvenancePanel({
  answer,
  onOpen,
}: {
  answer: Answer | null;
  onOpen: (c: Citation) => void;
}) {
  if (!answer)
    return (
      <div className="retrieval-empty">
        <div className="empty-icon lavender">
          <Workflow size={27} />
        </div>
        <h3>A clear path to every answer.</h3>
        <p>
          See which code was retrieved, how it was found, and why it matters.
        </p>
        <div className="pipeline-step">
          <span>
            <Search size={17} />
          </span>
          <div>
            <strong>Find relevant code</strong>
            <p>Semantic search matches your question.</p>
          </div>
        </div>
        <div className="pipeline-connector" />
        <div className="pipeline-step">
          <span className="mint">
            <GitBranch size={17} />
          </span>
          <div>
            <strong>Follow the dependencies</strong>
            <p>The graph connects related functions.</p>
          </div>
        </div>
        <div className="pipeline-connector" />
        <div className="pipeline-step">
          <span className="peach">
            <ShieldCheck size={17} />
          </span>
          <div>
            <strong>Check the evidence</strong>
            <p>Grounding makes uncertainty visible.</p>
          </div>
        </div>
      </div>
    );
  const semantic = answer.retrieved.filter(
    (r) => r.source === "semantic",
  ).length;
  const graph = answer.retrieved.length - semantic;
  return (
    <div className="provenance">
      <div className="retrieval-summary">
        <span className="section-label">ANSWER PROVENANCE</span>
        <h3>{answer.retrieved.length} pieces of the picture.</h3>
        <p>Exactly what went into this answer.</p>
        <div className="retrieval-counts">
          <span>
            <i className="semantic-dot" />
            {semantic} semantic
          </span>
          <span>
            <i className="graph-dot" />
            {graph} graph
          </span>
        </div>
      </div>
      <div className="router-box">
        <Workflow size={17} />
        <div>
          <span>Detected question type</span>
          <strong>
            {answer.query_type
              ? answer.query_type.replace(/_/g, " ")
              : "not classified (fixed retrieval)"}
          </strong>
        </div>
        <span className="router-mode">{answer.mode}</span>
      </div>
      {answer.retrieved.length ? (
        <table className="retrieval-table" aria-label="Retrieved code chunks">
          <thead>
            <tr>
              <th scope="col">RANK</th>
              <th scope="col">SOURCE / RETRIEVAL PATH</th>
            </tr>
          </thead>
          <tbody>
            {answer.retrieved.map((item) => (
              <tr key={item.chunk.id}>
                <td className="rank">{String(item.rank).padStart(2, "0")}</td>
                <td>
                  <button
                    className="retrieved-row"
                    onClick={() => onOpen({ ...item.chunk, valid: true })}
                  >
                    <span className="retrieved-content">
                      <div className="chunk-name">
                        <span>{item.chunk.name}</span>
                        <ArrowUpRight size={13} />
                      </div>
                      <div className="chunk-path">
                        {item.chunk.file_path}:{item.chunk.start_line}-
                        {item.chunk.end_line}
                      </div>
                      <span className={`source-badge ${item.source}`}>
                        {item.source === "semantic" ? (
                          <Search size={11} />
                        ) : (
                          <GitBranch size={11} />
                        )}{" "}
                        {item.source === "semantic"
                          ? `semantic ${item.score?.toFixed(2) ?? "—"}`
                          : `graph via ${item.via ?? "dependency"}`}
                      </span>
                    </span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="no-retrieved">
          <Search size={22} />
          <p>
            {answer.mode === "baseline"
              ? "Baseline mode does not retrieve code."
              : "No supporting chunks were retrieved."}
          </p>
        </div>
      )}
      <div className="retrieval-bottom">
        <ArrowDown size={13} />
        <span>
          {answer.tokens_used !== null
            ? `${answer.tokens_used.toLocaleString()} tokens · `
            : ""}
          {(answer.latency_ms / 1000).toFixed(2)}s total
        </span>
      </div>
    </div>
  );
}
