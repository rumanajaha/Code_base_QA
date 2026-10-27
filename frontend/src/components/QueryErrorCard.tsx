import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import type { Message, Mode, Repository } from "../types";

interface QueryErrorCardProps {
  message: Message;
  repo: Repository | undefined;
  querying: boolean;
  onSend: (text?: string, m?: Mode) => void;
  onQuestionChange: (q: string) => void;
  onReloadRepos?: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function QueryErrorCard({
  message: m,
  repo,
  querying,
  onSend,
  onQuestionChange,
  onReloadRepos,
  inputRef,
}: QueryErrorCardProps) {
  return (
    <div className="query-error" role="alert">
      <TriangleAlert size={18} />
      <div className="query-error-content">
        <strong>
          {m.status === 404
            ? "Repository missing on backend (404)"
            : m.status === 409
              ? "Repository not ready yet (409)"
              : m.status === 422
                ? "Invalid query request (422)"
                : m.status === 501
                  ? "Mode not supported (501)"
                  : "We couldn’t get that answer."}
        </strong>
        <p>{m.error}</p>
        {m.errorDetail && (
          <p className="query-error-detail">{m.errorDetail}</p>
        )}
        <div className="query-error-actions">
          {m.status === 404 && onReloadRepos && (
            <button
              type="button"
              className="text-button"
              onClick={onReloadRepos}
            >
              <RotateCw size={13} />
              Refresh repository list
            </button>
          )}
          {m.status === 409 &&
            repo &&
            (repo.stage || repo.progress !== undefined) && (
              <div className="query-error-progress">
                <Loader2 className="spin" size={13} />
                <span>
                  {repo.stage || "Indexing"}{" "}
                  {repo.progress !== undefined ? `(${repo.progress}%)` : "…"}
                </span>
              </div>
            )}
          {m.retryQuestion && (
            <>
              <button
                type="button"
                className="text-button"
                disabled={querying}
                onClick={() => onSend(m.retryQuestion, m.retryMode)}
              >
                <RotateCw size={13} />
                {m.status === 501 ? "Retry in available mode" : "Try again"}
              </button>
              <button
                type="button"
                className="text-button restore-btn"
                onClick={() => {
                  if (m.retryQuestion) {
                    onQuestionChange(m.retryQuestion);
                    inputRef.current?.focus();
                  }
                }}
                title="Put question back into the input box"
              >
                Restore to input
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
