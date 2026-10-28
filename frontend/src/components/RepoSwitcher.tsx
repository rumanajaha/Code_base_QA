import { useRef, useState } from "react";
import { ChevronDown, GitBranch } from "lucide-react";
import type { Repository } from "../types";
import RepoSwitcherMenu from "./RepoSwitcherMenu";

interface RepoSwitcherProps {
  repos: Repository[];
  activeId: string;
  onSelectRepo: (id: string) => void;
  onConnect: () => void;
  onReindex: () => void;
  canReindex: boolean;
  reindexing: boolean;
}

export default function RepoSwitcher({
  repos,
  activeId,
  onSelectRepo,
  onConnect,
  onReindex,
  canReindex,
  reindexing,
}: RepoSwitcherProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherFilter, setSwitcherFilter] = useState("");
  const [switcherIndex, setSwitcherIndex] = useState(0);

  const switcherTriggerRef = useRef<HTMLButtonElement>(null);

  const activeRepo = repos.find((r) => r.id === activeId);
  const isNonDefault =
    Boolean(activeRepo?.branch) &&
    !["main", "master", "default"].includes(activeRepo!.branch.toLowerCase()) &&
    (activeRepo!.id.split("__").length > 2 || !["main", "master"].includes(activeRepo!.branch.toLowerCase()));

  const filteredSwitcherRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(switcherFilter.toLowerCase()),
  );

  const openSwitcher = () => {
    setSwitcherFilter("");
    const activeIdx = repos.findIndex((r) => r.id === activeId);
    setSwitcherIndex(activeIdx >= 0 ? activeIdx : 0);
    setSwitcherOpen(true);
  };

  const selectRepo = (id: string) => {
    onSelectRepo(id);
    setSwitcherOpen(false);
    switcherTriggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openSwitcher();
    }
  };

  return (
    <div className="repo-switcher">
      <button
        ref={switcherTriggerRef}
        type="button"
        className="repo-switcher-trigger"
        onClick={() => {
          if (switcherOpen) {
            setSwitcherOpen(false);
          } else {
            openSwitcher();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={switcherOpen}
        aria-label="Select repository"
      >
        <span className={`repo-switcher-dot ${activeRepo?.status || "none"}`} />
        <span className="repo-switcher-name">
          {activeRepo?.name || "Select repository"}
          {isNonDefault && activeRepo?.branch && (
            <span className="branch-chip" title={`Branch: ${activeRepo.branch}`}>
              <GitBranch size={9} />
              {activeRepo.branch}
            </span>
          )}
        </span>
        <ChevronDown
          size={13}
          className={`repo-switcher-chevron ${switcherOpen ? "open" : ""}`}
        />
      </button>

      {switcherOpen && (
        <RepoSwitcherMenu
          repos={repos}
          filteredRepos={filteredSwitcherRepos}
          activeId={activeId}
          switcherFilter={switcherFilter}
          onFilterChange={(val) => {
            setSwitcherFilter(val);
            setSwitcherIndex(0);
          }}
          switcherIndex={switcherIndex}
          onIndexChange={setSwitcherIndex}
          onSelectRepo={selectRepo}
          onClose={() => setSwitcherOpen(false)}
          onConnect={onConnect}
          onReindex={onReindex}
          canReindex={canReindex}
          reindexing={reindexing}
          activeRepo={activeRepo}
          triggerRef={switcherTriggerRef}
        />
      )}
    </div>
  );
}
