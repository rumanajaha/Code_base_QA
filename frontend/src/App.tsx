import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { isDemo } from "./api";
import type { Repository } from "./types";
import { useBackendStatus } from "./hooks/useBackendStatus";
import { useRepositories } from "./hooks/useRepositories";
import { useChatSession } from "./hooks/useChatSession";
import { useSettings } from "./hooks/useSettings";
import { useFocusTrap } from "./hooks/useFocusTrap";
import Topbar from "./components/Topbar";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import EvidencePanel from "./components/EvidencePanel";
import HelpModal from "./components/HelpModal";
import ConnectModal from "./components/ConnectModal";
import SettingsModal from "./components/SettingsModal";
import ClearDataModal from "./components/ClearDataModal";
import StatusModal from "./components/StatusModal";
import RemoveRepoModal from "./components/RemoveRepoModal";

export default function App() {
  const { settings, updateSettings, toggleTheme, clearAllLocalData, userInitial } = useSettings();
  const [showConnect, setShowConnect] = useState(false);
  const [connectInitialUrl, setConnectInitialUrl] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearData, setShowClearData] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [repoToRemove, setRepoToRemove] = useState<Repository | null>(null);
  const [removingRepo, setRemovingRepo] = useState(false);
  const [toast, setToast] = useState("");

  const backendStatus = useBackendStatus();
  const isBackendBlocked =
    backendStatus.state === "unreachable" || backendStatus.state === "misconfigured";
  const backendBlockedReason =
    backendStatus.state === "misconfigured"
      ? (backendStatus.message || "Backend URL is misconfigured. Please check VITE_API_URL.")
      : "Backend is unreachable. Please start the backend or check the connection.";

  const {
    repos,
    loadingRepos,
    repoError,
    activeId,
    setActiveId,
    activeRepo,
    stats,
    currentStats,
    reindexing,
    reloadRepos,
    triggerReindex,
    handleConnected,
    handleResetDemo,
    removeRepository,
    pollingPaused,
    retryPolling,
    getElapsedSeconds,
  } = useRepositories(backendStatus.state);

  const ready = activeRepo?.status === "ready";

  const chat = useChatSession(
    activeRepo,
    ready,
    isBackendBlocked,
    setToast,
    settings.defaultMode,
    settings.showRetrievalByDefault,
  );

  useFocusTrap(
    showConnect ||
      showHelp ||
      showSettings ||
      showClearData ||
      showStatusModal ||
      Boolean(repoToRemove),
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function reindex() {
    if (!activeRepo || reindexing) return;
    try {
      await triggerReindex(activeRepo.id);
      chat.clearCitation();
      setToast("Re-indexing started. Your chat is saved.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Re-indexing failed. Please retry.");
    }
  }

  return (
    <div className="app-shell">
      <Topbar
        onOpenSidebar={() => setShowSidebar(true)}
        onOpenHelp={() => setShowHelp(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenStatus={() => setShowStatusModal(true)}
        onOpenClearData={() => setShowClearData(true)}
        theme={settings.theme}
        onToggleTheme={toggleTheme}
        isDemo={isDemo}
        userInitial={userInitial}
        displayName={settings.displayName}
      />

      <div className="workspace-layout">
        <Sidebar
          showSidebar={showSidebar}
          onCloseSidebar={() => setShowSidebar(false)}
          repos={repos}
          activeId={activeId}
          onSelectRepo={setActiveId}
          onConnect={() => setShowConnect(true)}
          loadingRepos={loadingRepos}
          repoError={repoError}
          onRetryRepos={reloadRepos}
          stats={stats}
          reindexing={reindexing}
          onReindex={reindex}
          backendStatus={backendStatus}
          pollingPaused={pollingPaused}
          onRetryPolling={retryPolling}
          getElapsedSeconds={getElapsedSeconds}
          onRequestRemove={(r) => setRepoToRemove(r)}
          onIndexAnotherBranch={(r) => {
            setConnectInitialUrl(r.url);
            setShowConnect(true);
          }}
        />

        <ChatPanel
          repo={activeRepo}
          currentStats={currentStats}
          messages={chat.messages}
          selectedAnswerId={chat.selectedAnswerId}
          onOpenCitation={chat.openCitation}
          onInspectAnswer={(id) => {
            chat.setSelectedAnswerId(id);
            chat.setTab("retrieval");
            chat.setShowEvidence(true);
          }}
          showEvidence={chat.showEvidence}
          onToggleEvidence={() => chat.setShowEvidence(!chat.showEvidence)}
          onNewChat={chat.newChat}
          onExportChat={chat.exportChat}
          onReindex={reindex}
          onResetDemo={async () => {
            await handleResetDemo();
            setToast("Demo reset. Connect a repository to get started.");
          }}
          onConnect={() => {
            setConnectInitialUrl("");
            setShowConnect(true);
          }}
          querying={chat.querying}
          busy={chat.busy}
          ready={ready}
          ingesting={activeRepo?.status === "queued" || activeRepo?.status === "ingesting"}
          reindexing={reindexing}
          question={chat.question}
          onQuestionChange={chat.setQuestion}
          onSend={chat.send}
          mode={chat.mode}
          onModeChange={chat.setMode}
          backendStatus={backendStatus}
          isBackendBlocked={isBackendBlocked}
          backendBlockedReason={backendBlockedReason}
          inputRef={chat.inputRef}
          endRef={chat.endRef}
          isDemo={isDemo}
          userInitial={userInitial}
          elapsedQuerySeconds={chat.elapsedQuerySeconds}
          onCancelQuery={chat.cancelQuery}
          onReloadRepos={reloadRepos}
        />

        <EvidencePanel
          showEvidence={chat.showEvidence}
          onCloseEvidence={() => chat.setShowEvidence(false)}
          tab={chat.tab}
          onTabChange={chat.setTab}
          repo={activeRepo}
          citation={chat.citation}
          onOpenCitation={chat.openCitation}
          selectedAnswer={chat.selectedAnswer}
          compactCode={settings.compactCode}
        />
      </div>


      <ConnectModal
        isOpen={showConnect}
        onClose={() => {
          setShowConnect(false);
          setConnectInitialUrl("");
        }}
        initialUrl={connectInitialUrl}
        existingRepos={repos}
        onConnected={(r, wasExisting) => {
          setActiveId(r.id);
          setShowConnect(false);
          setShowSidebar(false);
          setConnectInitialUrl("");
          if (wasExisting || r.already_indexed) {
            setToast("This branch is already indexed");
          } else {
            setToast(
              isDemo
                ? "Sample indexing started. Demo code will be used."
                : "Repository connected. Indexing has started.",
            );
            handleConnected(r.id);
          }
        }}
        disabled={isBackendBlocked}
        disabledReason={backendBlockedReason}
      />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} isDemo={isDemo} />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        backendStatus={backendStatus}
      />

      <ClearDataModal
        isOpen={showClearData}
        onClose={() => setShowClearData(false)}
        onConfirm={() => {
          clearAllLocalData();
          chat.clearAllChats();
          setShowClearData(false);
          setToast("All local data, demo repositories, and preferences have been cleared.");
        }}
      />

      <StatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        status={backendStatus}
      />

      <RemoveRepoModal
        isOpen={Boolean(repoToRemove)}
        onClose={() => setRepoToRemove(null)}
        repo={repoToRemove}
        loading={removingRepo}
        onConfirm={async () => {
          if (!repoToRemove) return;
          setRemovingRepo(true);
          try {
            const { hiddenLocally } = await removeRepository(repoToRemove.id, chat.deleteRepoChat);
            setRepoToRemove(null);
            setToast(
              hiddenLocally
                ? "Remove isn't supported by this backend; it was hidden locally instead"
                : `Repository "${repoToRemove.name}" removed.`,
            );
          } catch (e) {
            setToast(e instanceof Error ? e.message : "Failed to remove repository.");
          } finally {
            setRemovingRepo(false);
          }
        }}
      />

      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
