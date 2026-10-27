import { AlertTriangle, Trash2, X } from "lucide-react";

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ClearDataModal({
  isOpen,
  onClose,
  onConfirm,
}: ClearDataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="clear-data-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-data-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clear-data-header">
          <div className="clear-data-icon">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 id="clear-data-title">Clear local data?</h3>
            <p>
              This will remove all saved conversations, cached demo repositories,
              and local preferences from your browser&apos;s localStorage.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            aria-label="Cancel and close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="clear-data-note">
          <strong>Backend safe:</strong> This will <em>never</em> delete or modify
          anything on the backend server or graph database.
        </div>

        <div className="clear-data-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            <Trash2 size={14} />
            Clear local data
          </button>
        </div>
      </div>
    </div>
  );
}
