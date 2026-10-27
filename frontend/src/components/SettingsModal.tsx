import { Globe, Moon, Server, Settings as SettingsIcon, Sun, X } from "lucide-react";
import { apiBase, isDemo } from "../api";
import type { BackendStatus } from "../hooks/useBackendStatus";
import type { Settings } from "../hooks/useSettings";
import type { Mode } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  backendStatus: BackendStatus;
}

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  backendStatus,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <div className="settings-header-title">
            <span className="settings-header-icon">
              <SettingsIcon size={18} />
            </span>
            <div>
              <h2 id="settings-dialog-title">Settings & Preferences</h2>
              <span>Customized for this browser</span>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          {/* Section: Profile */}
          <div className="settings-section">
            <label className="settings-label" htmlFor="settings-display-name">
              Display Name
            </label>
            <div className="input-wrap">
              <input
                id="settings-display-name"
                type="text"
                placeholder="You"
                value={settings.displayName}
                onChange={(e) =>
                  onUpdateSettings({ displayName: e.target.value })
                }
              />
            </div>
            <span className="settings-hint">
              Used in message bubbles and your profile avatar initial.
            </span>
          </div>

          {/* Section: Default Mode */}
          <div className="settings-section">
            <label className="settings-label" htmlFor="settings-default-mode">
              Default Retrieval Mode
            </label>
            <select
              id="settings-default-mode"
              className="settings-select"
              value={settings.defaultMode}
              onChange={(e) =>
                onUpdateSettings({ defaultMode: e.target.value as Mode })
              }
            >
              <option value="hybrid">
                Hybrid (Semantic + Dependency Graph - recommended)
              </option>
              <option value="adaptive">
                Adaptive (Chooses strategy automatically)
              </option>
              <option value="semantic">
                Semantic (Vector search by meaning)
              </option>
              <option value="baseline">
                Baseline (Direct generation without retrieval)
              </option>
            </select>
            <span className="settings-hint">
              Adaptive will automatically switch to Hybrid if not yet supported on your backend.
            </span>
          </div>

          {/* Section: Theme */}
          <div className="settings-section">
            <span className="settings-label">Appearance & Theme</span>
            <div className="settings-theme-toggle">
              <button
                type="button"
                className={`settings-theme-btn ${settings.theme === "light" ? "active" : ""}`}
                onClick={() => onUpdateSettings({ theme: "light" })}
              >
                <Sun size={15} />
                <span>Light</span>
              </button>
              <button
                type="button"
                className={`settings-theme-btn ${settings.theme === "dark" ? "active" : ""}`}
                onClick={() => onUpdateSettings({ theme: "dark" })}
              >
                <Moon size={15} />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* Section: View Preferences */}
          <div className="settings-section">
            <span className="settings-label">Workspace Preferences</span>
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={settings.compactCode}
                onChange={(e) =>
                  onUpdateSettings({ compactCode: e.target.checked })
                }
              />
              <div>
                <strong>Compact code view</strong>
                <span>Reduces line spacing in the right evidence panel</span>
              </div>
            </label>

            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={settings.showRetrievalByDefault}
                onChange={(e) =>
                  onUpdateSettings({
                    showRetrievalByDefault: e.target.checked,
                  })
                }
              />
              <div>
                <strong>Show Retrieval tab by default</strong>
                <span>
                  Opens the graph & ranking inspector instead of code when selecting answers
                </span>
              </div>
            </label>
          </div>

          {/* Section: Read-only Diagnostics */}
          <div className="settings-section settings-diagnostics">
            <span className="settings-label">Environment & Diagnostics</span>
            <div className="settings-diag-row">
              <div className="settings-diag-label">
                <Globe size={13} />
                <span>API URL</span>
              </div>
              <span
                className="settings-diag-val"
                title={apiBase || (isDemo ? "Demo mode" : "None")}
              >
                {apiBase || (isDemo ? "Demo mode (no remote API)" : "Not configured")}
              </span>
            </div>

            <div className="settings-diag-row">
              <div className="settings-diag-label">
                <Server size={13} />
                <span>Backend status</span>
              </div>
              <span className="settings-diag-val">
                <span className={`status-light ${backendStatus.state}`} />
                <span style={{ textTransform: "capitalize" }}>
                  {backendStatus.state}
                </span>
                {backendStatus.latencyMs != null && (
                  <span style={{ color: "var(--muted)", marginLeft: "4px" }}>
                    · {backendStatus.latencyMs} ms
                  </span>
                )}
              </span>
            </div>

            {backendStatus.details && (
              <div className="status-popover-chips" style={{ marginTop: "6px" }}>
                {typeof backendStatus.details.neo4j === "boolean" && (
                  <span
                    className={`status-chip ${backendStatus.details.neo4j ? "ok" : "fail"}`}
                  >
                    Neo4j: {backendStatus.details.neo4j ? "ok" : "failed"}
                  </span>
                )}
                {typeof backendStatus.details.chroma === "boolean" && (
                  <span
                    className={`status-chip ${backendStatus.details.chroma ? "ok" : "fail"}`}
                  >
                    Chroma: {backendStatus.details.chroma ? "ok" : "failed"}
                  </span>
                )}
                {typeof backendStatus.details.llm_configured === "boolean" && (
                  <span
                    className={`status-chip ${backendStatus.details.llm_configured ? "ok" : "fail"}`}
                  >
                    LLM: {backendStatus.details.llm_configured ? "ok" : "missing"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button type="button" className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
