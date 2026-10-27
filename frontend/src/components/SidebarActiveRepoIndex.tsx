import {
  CircleHelp,
  Files,
  GitBranch,
  Layers3,
  Loader2,
  RotateCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import type { Ingestion, Repository } from "../types";

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

interface SidebarActiveRepoIndexProps {
  repo: Repository;
  currentStats?: Ingestion;
  ready: boolean;
  ingesting: boolean;
  reindexing: boolean;
  onReindex: () => void;
  onRequestRemove: (repo: Repository) => void;
  getElapsedSeconds: (id: string) => number;
  pollingPaused: boolean;
  onRetryPolling: () => void;
  repoError: string;
  onRetryRepos: () => void;
}

export default function SidebarActiveRepoIndex({
  repo,
  currentStats,
  ready,
  ingesting,
  reindexing,
  onReindex,
  onRequestRemove,
  getElapsedSeconds,
  pollingPaused,
  onRetryPolling,
  repoError,
  onRetryRepos,
}: SidebarActiveRepoIndexProps) {
  return (
    <>
      <div className="source-divider" />
      <div className="index-heading">
        <span className="section-label">REPOSITORY INDEX</span>
        <span className={`tiny-status ${ready ? "" : "pending"}`}>
          {ready
            ? "Up to date"
            : ingesting
              ? "In progress"
              : "Needs attention"}
        </span>
      </div>
      <div className="index-stats">
        <div>
          <Files size={15} />
          <span>Python files</span>
          <strong>{currentStats?.files ?? "—"}</strong>
        </div>
        <div>
          <Layers3 size={15} />
          <span>Code chunks</span>
          <strong>{currentStats?.chunks ?? "—"}</strong>
        </div>
        <div>
          <Workflow size={15} />
          <span>Graph nodes</span>
          <strong>{currentStats?.graph_nodes ?? "—"}</strong>
        </div>
        <div>
          <GitBranch size={15} />
          <span>Connections</span>
          <strong>{currentStats?.graph_edges ?? "—"}</strong>
        </div>
      </div>
      {ingesting && (
        <div className="ingestion-box" role="status">
          <div className="ingestion-stage-row">
            <Loader2 className="spin" size={13} />
            <span>
              {currentStats?.stage || "Indexing"}
              {currentStats?.progress != null
                ? ` (${currentStats.progress}%)`
                : ""}
            </span>
            <span className="ingestion-elapsed">
              · {formatElapsed(getElapsedSeconds(repo.id))}
            </span>
          </div>
          <div
            className={`progress-track ${currentStats?.progress == null ? "indeterminate" : "determinate"}`}
            role="progressbar"
            aria-valuenow={currentStats?.progress ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              style={{
                width:
                  currentStats?.progress != null
                    ? `${Math.min(100, Math.max(0, currentStats.progress))}%`
                    : undefined,
              }}
            />
          </div>
          <p>Chat will be ready when indexing finishes.</p>
          {pollingPaused && (
            <div className="polling-paused-banner">
              <span>Polling paused (network issues).</span>
              <button
                type="button"
                className="text-button"
                onClick={onRetryPolling}
              >
                <RotateCw size={12} />
                Retry polling
              </button>
            </div>
          )}
        </div>
      )}
      {repo.status === "failed" && (
        <div className="ingestion-failed" role="alert">
          <div className="failed-header">
            <TriangleAlert size={16} />
            <strong>Indexing failed</strong>
          </div>
          {(() => {
            const err =
              currentStats?.error ||
              repo.error ||
              "Indexing failed. Please check backend logs or retry.";
            const isLong = err.length > 90;
            return isLong ? (
              <details className="failed-details">
                <summary>
                  {err.slice(0, 80)}…{" "}
                  <span className="failed-show-more">Details</span>
                </summary>
                <p className="failed-error-full">{err}</p>
              </details>
            ) : (
              <p className="failed-error-full">{err}</p>
            );
          })()}
          <div className="failed-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onReindex}
              disabled={reindexing}
            >
              <RotateCw size={13} />
              Re-index
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => onRequestRemove(repo)}
            >
              <Trash2 size={13} />
              Remove
            </button>
          </div>
        </div>
      )}
      {ready && (
        <div className="index-complete">
          <ShieldCheck size={13} />
          <span>Indexed and ready for questions</span>
        </div>
      )}
      {ready && currentStats && currentStats.unresolved_calls > 0 && (
        <details className="unresolved">
          <summary>
            {currentStats.unresolved_calls} unresolved calls{" "}
            <CircleHelp size={11} />
          </summary>
          <p>
            Dynamic or external calls could not be resolved. The dependency
            graph may be incomplete.
          </p>
        </details>
      )}
      {repoError && (
        <div className="inline-error" role="alert">
          {repoError}
          <button className="text-button" onClick={onRetryRepos}>
            Retry connection
          </button>
        </div>
      )}
    </>
  );
}
