import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RotateCw, X } from "lucide-react";
import { apiBase, isDemo } from "../api";
import type { BackendStatus } from "../hooks/useBackendStatus";

interface StatusPopoverProps {
  status: BackendStatus;
}

export default function StatusPopover({ status }: StatusPopoverProps) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const footerBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showPopover) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPopover(false);
        footerBtnRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        footerBtnRef.current &&
        !footerBtnRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPopover]);

  return (
    <div className="sidebar-footer-wrap">
      {showPopover && (
        <div
          ref={popoverRef}
          className="status-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Backend connection status"
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
              onClick={() => setShowPopover(false)}
              aria-label="Close status popover"
            >
              <X size={12} />
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
      )}

      <button
        ref={footerBtnRef}
        type="button"
        className="sidebar-footer"
        onClick={() => setShowPopover((open) => !open)}
        aria-expanded={showPopover}
        aria-haspopup="dialog"
        aria-label="Backend status"
      >
        <span className={`status-light ${status.state}`} />
        <span>
          {status.state === "connected" &&
            (status.latencyMs != null
              ? `Backend connected · ${status.latencyMs} ms`
              : "Backend connected")}
          {status.state === "checking" && "Checking backend…"}
          {status.state === "unreachable" && "Backend unreachable"}
          {status.state === "misconfigured" && "Backend URL misconfigured"}
          {status.state === "demo" && "Demo mode · sample code"}
        </span>
        <ArrowUpRight size={12} />
      </button>
    </div>
  );
}
