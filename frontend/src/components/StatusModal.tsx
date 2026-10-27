import { RotateCw, X } from "lucide-react";
import { apiBase, isDemo } from "../api";
import type { BackendStatus } from "../hooks/useBackendStatus";

interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: BackendStatus;
}

export default function StatusModal({
  isOpen,
  onClose,
  status,
}: StatusModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="status-popover status-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Backend connection status"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="status-popover-header">
          <span className="status-popover-title">
            <span className={`status-light ${status.state}`} />
            Backend status
          </span>
          <button
            type="button"
            className="ghost-button icon-button"
            style={{ padding: "2px", width: "18px", height: "18px" }}
            onClick={onClose}
            aria-label="Close status dialog"
          >
            <X size={14} />
          </button>
        </div>

        <div className="status-popover-row">
          <span className="status-popover-label">API URL:</span>
          <span className="status-popover-value" title={apiBase || ""}>
            {apiBase || (isDemo ? "Demo (no backend)" : "(empty)")}
          </span>
        </div>

        <div className="status-popover-row">
          <span className="status-popover-label">State:</span>
          <span className="status-popover-value">{status.state}</span>
        </div>

        <div className="status-popover-row">
          <span className="status-popover-label">Latency:</span>
          <span className="status-popover-value">
            {status.latencyMs != null ? `${status.latencyMs} ms` : "—"}
          </span>
        </div>

        <div className="status-popover-row">
          <span className="status-popover-label">Last check:</span>
          <span className="status-popover-value">
            {status.lastChecked
              ? status.lastChecked.toLocaleTimeString()
              : "Never"}
          </span>
        </div>

        {status.details && (
          <div className="status-popover-chips">
            {typeof status.details.neo4j === "boolean" && (
              <span
                className={`status-chip ${status.details.neo4j ? "ok" : "fail"}`}
              >
                Neo4j: {status.details.neo4j ? "ok" : "failed"}
              </span>
            )}
            {typeof status.details.chroma === "boolean" && (
              <span
                className={`status-chip ${status.details.chroma ? "ok" : "fail"}`}
              >
                Chroma: {status.details.chroma ? "ok" : "failed"}
              </span>
            )}
            {typeof status.details.llm_configured === "boolean" && (
              <span
                className={`status-chip ${status.details.llm_configured ? "ok" : "fail"}`}
              >
                LLM: {status.details.llm_configured ? "ok" : "missing"}
              </span>
            )}
          </div>
        )}

        {status.message && (
          <div className="status-popover-error">{status.message}</div>
        )}

        <div className="status-popover-actions">
          <button
            type="button"
            className="status-popover-btn"
            onClick={() => status.retry()}
          >
            <RotateCw size={11} />
            Check again
          </button>
          {!isDemo && apiBase && (
            <a
              href={`${apiBase}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="status-popover-btn"
            >
              Open API docs ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
