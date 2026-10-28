import type { Repository } from "../types";
import RepoConnectForm from "./RepoConnectForm";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (r: Repository, wasExisting?: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  existingRepos?: Repository[];
  initialUrl?: string;
}

export default function ConnectModal({
  isOpen,
  onClose,
  onConnected,
  disabled,
  disabledReason,
  existingRepos = [],
  initialUrl = "",
}: ConnectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="connect-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Connect a repository"
        onClick={(e) => e.stopPropagation()}
      >
        <RepoConnectForm
          onConnected={onConnected}
          onClose={onClose}
          disabled={disabled}
          disabledReason={disabledReason}
          existingRepos={existingRepos}
          initialUrl={initialUrl}
        />
      </div>
    </div>
  );
}
