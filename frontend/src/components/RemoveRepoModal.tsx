import { AlertTriangle, Trash2, X } from "lucide-react";
import type { Repository } from "../types";

interface RemoveRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  repo: Repository | null;
  loading?: boolean;
}

export default function RemoveRepoModal({
  isOpen,
  onClose,
  onConfirm,
  repo,
  loading = false,
}: RemoveRepoModalProps) {
  if (!isOpen || !repo) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="clear-data-modal remove-repo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-repo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clear-data-header">
          <div className="clear-data-icon">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 id="remove-repo-title">Remove {repo.name}?</h3>
            <p>
              This deletes the index and graph on the backend. The GitHub
              repository is not affected.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            aria-label="Cancel and close"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <div className="clear-data-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onConfirm}
            disabled={loading}
          >
            <Trash2 size={14} />
            {loading ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
