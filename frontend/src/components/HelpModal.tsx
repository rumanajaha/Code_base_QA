import { ArrowRight, Database, X } from "lucide-react";
import Brand from "./Brand";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDemo: boolean;
}

export default function HelpModal({
  isOpen,
  onClose,
  isDemo,
}: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-top">
          <Brand small />
          <button
            className="icon-button"
            aria-label="Close guide"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <span className="welcome-eyebrow">A CLEARER VIEW OF YOUR CODE</span>
        <h2 id="help-title">
          Start with a question.
          <br />
          Leave with understanding.
        </h2>
        <div className="help-step">
          <span>01</span>
          <div>
            <strong>Bring your repository</strong>
            <p>
              Connect a GitHub Python repository and choose a branch. Wait
              for files, code chunks, and dependencies to be indexed.
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>02</span>
          <div>
            <strong>Follow your curiosity</strong>
            <p>
              Ask about a flow, a function, or how files connect. Adaptive
              mode chooses a retrieval strategy for your question.
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>03</span>
          <div>
            <strong>See the evidence</strong>
            <p>
              Click citations for exact code. Open Retrieval to inspect
              semantic matches, graph connections, and the grounding score.
            </p>
          </div>
        </div>
        <div className="help-shortcuts">
          <span>
            <kbd>Enter</kbd>Send question
          </span>
          <span>
            <kbd>Shift</kbd> + <kbd>Enter</kbd>New line
          </span>
        </div>
        {isDemo && (
          <div className="help-demo">
            <Database size={17} />
            <p>
              <strong>You’re exploring a frontend demo.</strong> Repository
              connections, indexing, and answers use local sample data.
              Configure <code>VITE_API_URL</code> to connect the FastAPI
              backend.
            </p>
          </div>
        )}
        <button className="primary-button" onClick={onClose}>
          Let’s explore
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
