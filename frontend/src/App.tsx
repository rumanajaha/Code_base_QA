import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Database,
  FileCode2,
  Files,
  Folder,
  GitBranch,
  Github,
  Layers3,
  Loader2,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import { api, apiBase, isDemo } from "./api";
import { useBackendStatus, type BackendState } from "./hooks/useBackendStatus";
import type { Citation, Ingestion, Message, Mode, Repository } from "./types";
import AnswerCard from "./components/AnswerCard";
import CodeViewer from "./components/CodeViewer";
import ProvenancePanel from "./components/ProvenancePanel";
import RepoConnectForm from "./components/RepoConnectForm";
const examples = [
  {
    icon: Workflow,
    tag: "TRACE A FLOW",
    text: "How does authentication work?",
    color: "blue",
  },
  {
    icon: GitBranch,
    tag: "CONNECT THE DOTS",
    text: "Which functions depend on each other?",
    color: "green",
  },
  {
    icon: Code2,
    tag: "EXPLORE THE DETAILS",
    text: "How are passwords verified?",
    color: "peach",
  },
];
const modeOptions: { value: Mode; label: string; description: string }[] = [
  {
    value: "adaptive",
    label: "Adaptive",
    description: "Chooses the right retrieval for your question",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Semantic search + dependency graph",
  },
  { value: "semantic", label: "Semantic", description: "Find code by meaning" },
  {
    value: "baseline",
    label: "Baseline",
    description: "General knowledge, without retrieval",
  },
];
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small-brand" : ""}`}>
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span>
        codebase<span className="brand-period">.</span>
      </span>
    </span>
  );
}
function readChats() {
  try {
    return JSON.parse(
      localStorage.getItem("codebase-chats-v1") || "{}",
    ) as Record<string, Message[]>;
  } catch {
    return {};
  }
}
function getInitialTheme() {
  try {
    return localStorage.getItem("codebase-theme") || "light";
  } catch {
    return "light";
  }
}
export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repoError, setRepoError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [stats, setStats] = useState<Record<string, Ingestion>>({});
  const [chats, setChats] = useState<Record<string, Message[]>>(readChats);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("adaptive");
  const [querying, setQuerying] = useState(false);
  const [pendingRepo, setPendingRepo] = useState("");
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [tab, setTab] = useState<"code" | "retrieval">("code");
  const [showConnect, setShowConnect] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEvidence, setShowEvidence] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [reindexing, setReindexing] = useState(false);
  const [listRefresh, setListRefresh] = useState(0);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const footerBtnRef = useRef<HTMLButtonElement>(null);

  const backendStatus = useBackendStatus();
  const prevBackendStateRef = useRef<BackendState>(backendStatus.state);

  const isBackendBlocked =
    backendStatus.state === "unreachable" ||
    backendStatus.state === "misconfigured";
  const backendBlockedReason =
    backendStatus.state === "misconfigured"
      ? (backendStatus.message || "Backend URL is misconfigured. Please check VITE_API_URL.")
      : "Backend is unreachable. Please start the backend or check the connection.";

  // When state changes from unreachable to connected, reload the repository list automatically
  useEffect(() => {
    if (
      prevBackendStateRef.current === "unreachable" &&
      backendStatus.state === "connected"
    ) {
      setListRefresh((r) => r + 1);
    }
    prevBackendStateRef.current = backendStatus.state;
  }, [backendStatus.state]);

  // Status popover: outside click and Escape handling
  useEffect(() => {
    if (!showStatusPopover) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowStatusPopover(false);
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
        setShowStatusPopover(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStatusPopover]);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const repo = repos.find((r) => r.id === activeId);
  const currentStats = activeId ? stats[activeId] : undefined;
  const messages = chats[activeId] || [];
  const selectedAnswer =
    messages.find((m) => m.id === selectedAnswerId)?.answer ??
    [...messages].reverse().find((m) => m.answer)?.answer ??
    null;
  const ready = repo?.status === "ready";
  const busy = querying && pendingRepo === activeId;
  const ingesting = repo?.status === "queued" || repo?.status === "ingesting";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("codebase-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!question && inputRef.current) inputRef.current.style.height = "auto";
  }, [question]);
  useEffect(() => {
    if (!showConnect && !showHelp) return;
    const dialog = document.querySelector<HTMLElement>(".modal-backdrop [role=dialog]");
    const previous = document.activeElement as HTMLElement | null;
    const elements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),a[href],textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      );
    elements()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = elements();
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [showConnect, showHelp]);
  useEffect(() => {
    localStorage.setItem("codebase-chats-v1", JSON.stringify(chats));
  }, [chats]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    let alive = true;
    setLoadingRepos(true);
    setRepoError("");
    api
      .repos()
      .then((data) => {
        if (!alive) return;
        setRepos(data);
        setActiveId((prev) =>
          data.some((r) => r.id === prev)
            ? prev
            : data.find((r) => r.status === "ready")?.id || data[0]?.id || "",
        );
      })
      .catch((e) => {
        if (alive) setRepoError(e.message);
      })
      .finally(() => {
        if (alive) setLoadingRepos(false);
      });
    return () => {
      alive = false;
    };
  }, [listRefresh]);
  const pollingIds = repos
    .filter(
      (r) => r.status === "queued" || r.status === "ingesting" || !stats[r.id],
    )
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    if (!pollingIds) return;
    let alive = true;
    const poll = async () => {
      await Promise.allSettled(
        pollingIds.split(",").map(async (id) => {
          try {
            const data = await api.status(id);
            if (!alive) return;
            setStats((s) => ({ ...s, [id]: data }));
            setRepos((rs) =>
              rs.map((r) =>
                r.id === id && r.status !== data.status
                  ? { ...r, status: data.status }
                  : r,
              ),
            );
            setRepoError("");
          } catch (e) {
            if (alive)
              setRepoError(
                e instanceof Error
                  ? e.message
                  : "Unable to check indexing status.",
              );
          }
        }),
      );
    };
    void poll();
    const interval = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [pollingIds]);
  useEffect(() => {
    if (messages.length) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } else {
      endRef.current?.parentElement?.scrollTo({ top: 0 });
    }
  }, [messages.length, busy]);
  useEffect(() => {
    setCitation(null);
    setSelectedAnswerId("");
    setQuestion("");
    setShowSidebar(false);
    setShowMenu(false);
  }, [activeId]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowConnect(false);
        setShowMode(false);
        setShowMenu(false);
        setShowSidebar(false);
        if (window.innerWidth < 1150) setShowEvidence(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (window.innerWidth < 1150) setShowEvidence(false);
  }, []);
  async function send(text = question, retryMode = mode) {
    const clean = text.trim();
    if (!clean || !repo || repo.status !== "ready" || querying) return;
    const id = repo.id;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: clean,
    };
    setChats((c) => ({ ...c, [id]: [...(c[id] || []), userMessage] }));
    setQuestion("");
    setQuerying(true);
    setPendingRepo(id);
    setShowMode(false);
    try {
      const answer = await api.query(id, clean, retryMode);
      const message: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: answer.text,
        answer,
      };
      setChats((c) => ({ ...c, [id]: [...(c[id] || []), message] }));
      if (activeRef.current === id) {
        setSelectedAnswerId(message.id);
        setTab("retrieval");
        if (window.innerWidth >= 1150) setShowEvidence(true);
      }
    } catch (e) {
      setChats((c) => ({
        ...c,
        [id]: [
          ...(c[id] || []),
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "",
            error:
              e instanceof Error
                ? e.message
                : "Something went wrong. Please try again.",
            retryQuestion: clean,
            retryMode,
          },
        ],
      }));
    } finally {
      setQuerying(false);
      setPendingRepo("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }
  function openCitation(c: Citation, answerId?: string) {
    setCitation(c);
    if (answerId) setSelectedAnswerId(answerId);
    setTab("code");
    setShowEvidence(true);
  }
  function connected(r: Repository) {
    setRepos((rs) => [...rs, r]);
    setActiveId(r.id);
    setShowConnect(false);
    setToast(
      isDemo
        ? "Sample indexing started. Demo code will be used."
        : "Repository connected. Indexing has started.",
    );
  }
  async function reindex() {
    if (!repo || reindexing) return;
    setReindexing(true);
    setShowMenu(false);
    try {
      await api.reindex(repo.id);
      setRepos((rs) =>
        rs.map((r) => (r.id === repo.id ? { ...r, status: "queued" } : r)),
      );
      setStats((s) => ({
        ...s,
        [repo.id]: {
          status: "queued",
          files: 0,
          chunks: 0,
          graph_nodes: 0,
          graph_edges: 0,
          unresolved_calls: 0,
          progress: 0,
        },
      }));
      setCitation(null);
      setToast("Re-indexing started. Your chat is saved.");
    } catch (e) {
      setToast(
        e instanceof Error ? e.message : "Re-indexing failed. Please retry.",
      );
    } finally {
      setReindexing(false);
    }
  }
  function newChat() {
    if (!messages.length) {
      inputRef.current?.focus();
      return;
    }
    setChats((c) => ({ ...c, [activeId]: [] }));
    setCitation(null);
    setSelectedAnswerId("");
    setTab("code");
    setToast("Started a fresh conversation.");
    setShowMenu(false);
  }
  function exportChat() {
    const text = messages
      .map(
        (m) =>
          `${m.role === "user" ? "You" : "Codebase"}\n${m.text || m.error}\n`,
      )
      .join("\n");
    const blob = new Blob(
      [`# ${repo?.name || "Codebase"} conversation\n\n${text}`],
      { type: "text/markdown" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repo?.name || "codebase"}-chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
    setToast("Conversation exported.");
  }
  const themeButton = (
    <button
      className="theme-button"
      onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    >
      {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
      <span>{theme === "light" ? "Light" : "Dark"}</span>
      <span className={`theme-switch ${theme === "dark" ? "is-dark" : ""}`}>
        <span />
      </span>
    </button>
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <button
            className="icon-button mobile-menu"
            aria-label="Open repositories"
            onClick={() => setShowSidebar(true)}
          >
            <Menu size={20} />
          </button>
          <Brand />
          <span className="brand-divider" />
          <span className="workspace-title">
            Your workspace
            <ChevronDown size={13} />
          </span>
        </div>
        <div className="topbar-actions">
          {isDemo && (
            <span className="demo-pill">
              <span />
              Demo workspace
            </span>
          )}
          <button
            className="help-button"
            aria-label="Quick guide"
            onClick={() => setShowHelp(true)}
          >
            <CircleHelp size={16} />
            <span>Quick guide</span>
          </button>
          <span className="topbar-divider" />
          {themeButton}
          <span
            className="avatar"
            title="Local workspace · no sign-in required"
          >
            J
          </span>
        </div>
      </header>
      <div className="workspace-layout">
        {showSidebar && (
          <div
            className="drawer-backdrop sidebar-backdrop"
            onClick={() => setShowSidebar(false)}
          />
        )}
        <aside className={`sidebar panel ${showSidebar ? "sidebar-open" : ""}`}>
          <div className="panel-title">
            <div>
              <Folder size={17} />
              <h2>Repositories</h2>
              <span className="count-pill">{repos.length}</span>
            </div>
            <div>
              <button
                className="icon-button small"
                title="Search repositories"
                aria-label="Search repositories"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <Search size={16} />
              </button>
              <button
                className="icon-button small mobile-close"
                aria-label="Close repositories"
                onClick={() => setShowSidebar(false)}
              >
                <PanelLeftClose size={17} />
              </button>
            </div>
          </div>
          <div className="sidebar-scroll">
            <button
              className="connect-button"
              onClick={() => setShowConnect(true)}
            >
              <Plus size={17} />
              Connect repository
            </button>
            {searchOpen && (
              <div className="repo-search input-wrap">
                <Search size={13} />
                <input
                  autoFocus
                  placeholder="Find a repository…"
                  aria-label="Filter repositories"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            )}
            <div className="section-label repository-section">
              YOUR SOURCES{" "}
              <span>
                {repos.length}{" "}
                {repos.length === 1 ? "repository" : "repositories"}
              </span>
            </div>
            {loadingRepos ? (
              <div className="sidebar-loading">
                <Loader2 className="spin" size={18} />
                Loading repositories…
              </div>
            ) : repoError && !repos.length ? (
              <div className="sidebar-error" role="alert">
                <TriangleAlert size={17} />
                <p>{repoError}</p>
                <button
                  className="text-button"
                  onClick={() => setListRefresh((n) => n + 1)}
                >
                  Try again <RotateCw size={12} />
                </button>
              </div>
            ) : repos.length ? (
              repos
                .filter((r) =>
                  r.name.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((r) => (
                  <button
                    key={r.id}
                    className={`repo-card ${r.id === activeId ? "active" : ""}`}
                    onClick={() => setActiveId(r.id)}
                    aria-pressed={r.id === activeId}
                  >
                    <div className="repo-card-main">
                      <span
                        className={`repo-icon ${r.id === activeId ? "active" : ""}`}
                      >
                        <Github size={18} />
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        <span>
                          <GitBranch size={11} />
                          {r.branch} <i />
                          Python
                        </span>
                      </div>
                      {r.id === activeId && (
                        <span className="repo-selected">
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <div className="repo-card-bottom">
                      <span className={`state-pill ${r.status}`}>
                        <span />
                        {r.status === "ready"
                          ? "Ready to explore"
                          : r.status === "ingesting"
                            ? "Indexing"
                            : r.status.charAt(0).toUpperCase() +
                              r.status.slice(1)}
                      </span>
                      <span>
                        {r.demo ? "Sample repo" : r.url.split("/")[3]}
                      </span>
                    </div>
                  </button>
                ))
            ) : (
              <div className="no-repos">
                <Github size={26} />
                <h3>A home for your code.</h3>
                <p>
                  Connect your first Python repository to start a conversation.
                </p>
              </div>
            )}
            {filter &&
              !repos.some((r) =>
                r.name.toLowerCase().includes(filter.toLowerCase()),
              ) && <p className="no-results">No matching repositories.</p>}
            {repo && (
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
                    <div>
                      <Loader2 className="spin" size={13} />
                      <span>
                        {currentStats?.stage || "Preparing your repository"}
                      </span>
                    </div>
                    <div
                      className={`progress-track ${currentStats?.progress === undefined ? "indeterminate" : ""}`}
                    >
                      <span
                        style={{ width: `${currentStats?.progress ?? 35}%` }}
                      />
                    </div>
                    <p>
                      {currentStats?.progress !== undefined
                        ? `${currentStats.progress}% · `
                        : ""}
                      Chat will be ready when indexing finishes.
                    </p>
                  </div>
                )}
                {repo.status === "failed" && (
                  <div className="ingestion-failed" role="alert">
                    <TriangleAlert size={16} />
                    <p>
                      {currentStats?.error ||
                        "Indexing failed. Please try again."}
                    </p>
                    <button
                      className="secondary-button"
                      onClick={reindex}
                      disabled={reindexing}
                    >
                      Retry indexing
                    </button>
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
                      Dynamic or external calls could not be resolved. The
                      dependency graph may be incomplete.
                    </p>
                  </details>
                )}
                {repoError && (
                  <div className="inline-error" role="alert">
                    {repoError}
                    <button
                      className="text-button"
                      onClick={() => setListRefresh((n) => n + 1)}
                    >
                      Retry connection
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="context-note">
              <span className="context-note-icon">
                <BookOpen size={17} />
              </span>
              <div>
                <strong>A little context goes a long way.</strong>
                <p>
                  Answers grounded in your code.
                  <br />
                  Connections you can actually follow.
                </p>
              </div>
              <span className="note-spark">✳</span>
            </div>
            <div className="sidebar-footer-wrap">
              {showStatusPopover && (
                <div
                  ref={popoverRef}
                  className="status-popover"
                  role="dialog"
                  aria-modal="false"
                  aria-label="Backend connection status"
                >
                  <div className="status-popover-header">
                    <span className="status-popover-title">
                      <span className={`status-light ${backendStatus.state}`} />
                      Backend status
                    </span>
                    <button
                      type="button"
                      className="ghost-button icon-button"
                      style={{ padding: "2px", width: "18px", height: "18px" }}
                      onClick={() => setShowStatusPopover(false)}
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
                    <span className="status-popover-value">{backendStatus.state}</span>
                  </div>

                  <div className="status-popover-row">
                    <span className="status-popover-label">Latency:</span>
                    <span className="status-popover-value">
                      {backendStatus.latencyMs != null
                        ? `${backendStatus.latencyMs} ms`
                        : "—"}
                    </span>
                  </div>

                  <div className="status-popover-row">
                    <span className="status-popover-label">Last check:</span>
                    <span className="status-popover-value">
                      {backendStatus.lastChecked
                        ? backendStatus.lastChecked.toLocaleTimeString()
                        : "Never"}
                    </span>
                  </div>

                  {backendStatus.details && (
                    <div className="status-popover-chips">
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

                  {backendStatus.message && (
                    <div className="status-popover-error">
                      {backendStatus.message}
                    </div>
                  )}

                  <div className="status-popover-actions">
                    <button
                      type="button"
                      className="status-popover-btn"
                      onClick={() => backendStatus.retry()}
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
                onClick={() => setShowStatusPopover((open) => !open)}
                aria-expanded={showStatusPopover}
                aria-haspopup="dialog"
                aria-label="Backend status"
              >
                <span className={`status-light ${backendStatus.state}`} />
                <span>
                  {backendStatus.state === "connected" &&
                    (backendStatus.latencyMs != null
                      ? `Backend connected · ${backendStatus.latencyMs} ms`
                      : "Backend connected")}
                  {backendStatus.state === "checking" && "Checking backend…"}
                  {backendStatus.state === "unreachable" && "Backend unreachable"}
                  {backendStatus.state === "misconfigured" && "Backend URL misconfigured"}
                  {backendStatus.state === "demo" && "Demo mode · sample code"}
                </span>
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </aside>
        <main className="chat-panel panel">
          {isBackendBlocked && (
            <div className="backend-warning-banner" role="alert">
              <div className="backend-warning-content">
                <TriangleAlert size={15} style={{ flexShrink: 0 }} />
                <span>
                  <strong>
                    {backendStatus.state === "misconfigured"
                      ? "Backend URL misconfigured:"
                      : "Backend unreachable:"}
                  </strong>{" "}
                  {backendStatus.message || "Cannot communicate with backend."}{" "}
                  <span className="backend-warning-hints">
                    (What to try: start the backend server; check VITE_API_URL; check CORS)
                  </span>
                </span>
              </div>
              <button
                type="button"
                className="backend-warning-retry-btn"
                onClick={() => backendStatus.retry()}
              >
                Retry
              </button>
            </div>
          )}
          <div className="chat-header">
            <div className="chat-header-title">
              <span className="chat-header-icon">
                <MessageSquare size={17} />
              </span>
              <div>
                <h1>{repo?.name || "A new perspective on your code"}</h1>
                <span>
                  {repo ? (
                    <>
                      <GitBranch size={11} />
                      {repo.branch}
                      <span className="header-dot">·</span>
                      {repo.demo
                        ? "Sample Python repository"
                        : "Python repository"}
                    </>
                  ) : (
                    "Your repository, in conversation"
                  )}
                </span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button
                className="icon-button"
                onClick={newChat}
                disabled={!ready || busy}
                title="New conversation"
                aria-label="New conversation"
              >
                <Plus size={18} />
              </button>
              <div className="menu-container">
                <button
                  className="icon-button"
                  onClick={() => setShowMenu(!showMenu)}
                  aria-label="Conversation options"
                  aria-expanded={showMenu}
                >
                  <MoreHorizontal size={20} />
                </button>
                {showMenu && (
                  <>
                    <div
                      className="popover-dismiss"
                      onClick={() => setShowMenu(false)}
                    />
                    <div className="options-menu">
                      <button
                        onClick={reindex}
                        disabled={!repo || ingesting || reindexing}
                      >
                        <RotateCw size={14} />
                        Re-index repository
                      </button>
                      <button onClick={exportChat} disabled={!messages.length}>
                        <ArrowDownToLine size={14} />
                        Export conversation
                      </button>
                      <button
                        onClick={newChat}
                        disabled={!messages.length || busy}
                      >
                        <Trash2 size={14} />
                        Clear conversation
                      </button>
                      {isDemo && (
                        <button
                          onClick={async () => {
                            await api.resetDemo();
                            setRepos([]);
                            setActiveId("");
                            setShowMenu(false);
                            setToast(
                              "Demo reset. Connect a repository to get started.",
                            );
                          }}
                          disabled={busy}
                        >
                          <ArrowLeft size={14} />
                          Show onboarding
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <button
                className={`icon-button evidence-toggle ${showEvidence ? "is-active" : ""}`}
                aria-label={
                  showEvidence ? "Hide evidence panel" : "Show evidence panel"
                }
                onClick={() => setShowEvidence(!showEvidence)}
                title="Toggle evidence panel"
              >
                {showEvidence ? (
                  <PanelRightClose size={18} />
                ) : (
                  <PanelRightOpen size={18} />
                )}
              </button>
            </div>
          </div>
          <div className="chat-content" aria-live="polite">
            {!messages.length ? (
              <div className="chat-welcome">
                <div className="welcome-art">
                  <div className="art-card art-card-one">
                    <FileCode2 size={23} />
                    <span />
                    <span />
                  </div>
                  <div className="art-card art-card-two">
                    <GitBranch size={23} />
                    <span />
                    <span />
                  </div>
                  <div className="art-spark">
                    <Sparkles size={25} />
                  </div>
                  <span className="art-dot one" />
                  <span className="art-dot two" />
                  <svg className="art-line" viewBox="0 0 200 100">
                    <path d="M30 70 Q100 0 170 55" />
                  </svg>
                </div>
                <span className="welcome-eyebrow">
                  <span /> LESS SEARCHING. MORE UNDERSTANDING.
                </span>
                <h2>
                  Your codebase,
                  <br />
                  <span>connected.</span>
                </h2>
                <p className="welcome-description">
                  {repo
                    ? "Big-picture questions. Line-by-line answers.\nMake sense of your code, one conversation at a time."
                    : "Connect a Python repository. Ask a question.\nDiscover how it all fits together."}
                </p>
                {repo ? (
                  <>
                    <div className="repo-context">
                      <span className="context-file-icon">
                        <FileCode2 size={13} />
                      </span>
                      <span>{currentStats?.files ?? "—"} files</span>
                      <span className="context-dot">·</span>
                      <span>{currentStats?.chunks ?? "—"} code chunks</span>
                      <span className="context-dot">·</span>
                      <span>One connected picture</span>
                    </div>
                    <div className="suggestions-label">
                      A FEW PLACES TO START <ArrowDown size={12} />
                    </div>
                    <div className="suggestions">
                      {examples.map(({ icon: Icon, tag, text, color }) => (
                        <button
                          className={`suggestion ${color}`}
                          key={text}
                          disabled={!ready || querying}
                          onClick={() => send(text)}
                        >
                          <span className="suggestion-icon">
                            <Icon size={18} />
                          </span>
                          <span className="suggestion-copy">
                            <small>{tag}</small>
                            <strong>{text}</strong>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="onboarding-action">
                    <button
                      className="primary-button"
                      onClick={() => setShowConnect(true)}
                    >
                      <Github size={17} />
                      Connect your first repository
                      <ArrowRight size={16} />
                    </button>
                    <span>Python repositories · No sign-in required</span>
                  </div>
                )}
                <div className="welcome-trust">
                  <ShieldCheck size={13} />
                  <span>Built for answers you can verify.</span>
                </div>
              </div>
            ) : (
              <div className="message-list">
                <div className="conversation-start">
                  <span />
                  THE CONVERSATION STARTS HERE
                  <span />
                </div>
                {messages.map((m) => (
                  <div key={m.id} className={`message ${m.role}`}>
                    {m.role === "user" ? (
                      <div className="user-message">
                        <span>{m.text}</span>
                        <span className="user-avatar">J</span>
                      </div>
                    ) : m.answer ? (
                      <AnswerCard
                        answer={m.answer}
                        selected={m.id === selectedAnswerId}
                        onCitation={(c) => openCitation(c, m.id)}
                        onInspect={() => {
                          setSelectedAnswerId(m.id);
                          setTab("retrieval");
                          setShowEvidence(true);
                        }}
                      />
                    ) : (
                      <div className="query-error" role="alert">
                        <TriangleAlert size={18} />
                        <div>
                          <strong>We couldn’t get that answer.</strong>
                          <p>{m.error}</p>
                          <button
                            className="text-button"
                            disabled={querying}
                            onClick={() => send(m.retryQuestion, m.retryMode)}
                          >
                            <RotateCw size={13} />
                            Try again
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="thinking-bubble" role="status">
                    <Sparkles className="thinking-spark" size={17} />
                    <span>Connecting the dots</span>
                    <span className="thinking-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="composer-area">
            {ingesting && (
              <div className="composer-notice">
                <Loader2 className="spin" size={13} />
                Indexing your repository. Your conversation starts in a moment.
              </div>
            )}
            <div className={`composer ${!ready ? "disabled" : ""}`}>
              <textarea
                ref={inputRef}
                aria-label="Ask a question about your code"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                }}
                placeholder={
                  ingesting
                    ? "Your code is getting connected…"
                    : !repo
                      ? "Connect a repository to get started…"
                      : repo.status === "failed"
                        ? "Re-index the repository to start chatting…"
                        : "Ask anything about your code…"
                }
                disabled={!ready || querying}
                rows={1}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <div className="mode-select-wrap">
                  <button
                    className="mode-button"
                    onClick={() => setShowMode(!showMode)}
                    aria-label="Retrieval mode"
                    aria-haspopup="menu"
                    aria-expanded={showMode}
                    disabled={querying}
                  >
                    <Sparkles size={14} />
                    {modeOptions.find((m) => m.value === mode)?.label}
                    <ChevronDown size={13} />
                  </button>
                  {showMode && (
                    <>
                      <div
                        className="popover-dismiss"
                        onClick={() => setShowMode(false)}
                      />
                      <div className="mode-menu" role="menu">
                        <span className="section-label">RETRIEVAL MODE</span>
                        {modeOptions.map((m) => (
                          <button
                            key={m.value}
                            role="menuitemradio"
                            aria-checked={mode === m.value}
                            onClick={() => {
                              setMode(m.value);
                              setShowMode(false);
                            }}
                          >
                            <span>
                              <strong>
                                {m.label}
                                {m.value === "adaptive" && (
                                  <small>Recommended</small>
                                )}
                              </strong>
                              <span>{m.description}</span>
                            </span>
                            {mode === m.value && <Check size={16} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <span className="composer-hint">
                  {ready ? (
                    <>
                      <span className="context-ready-dot" />
                      Repository context on
                    </>
                  ) : (
                    "Your code stays in context"
                  )}
                </span>
                <button
                  className="send-button"
                  onClick={() => void send()}
                  disabled={!ready || !question.trim() || querying || isBackendBlocked}
                  aria-label="Send question"
                  title={
                    isBackendBlocked
                      ? backendBlockedReason
                      : "Send question (Enter)"
                  }
                >
                  {busy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <ArrowUp size={19} />
                  )}
                </button>
              </div>
            </div>
            <div className="composer-footnote">
              <span>Codebase can make mistakes. Follow the citations.</span>
              <span>
                <kbd>↵</kbd> to send
              </span>
            </div>
          </div>
        </main>
        {showEvidence && (
          <>
            <div
              className="drawer-backdrop evidence-backdrop"
              onClick={() => setShowEvidence(false)}
            />
            <aside className="evidence-panel panel">
              <div className="panel-title">
                <div>
                  <span className="evidence-heading-icon">
                    <Layers3 size={17} />
                  </span>
                  <h2>Evidence</h2>
                </div>
                <button
                  className="icon-button small"
                  aria-label="Close evidence panel"
                  title="Close evidence panel"
                  onClick={() => setShowEvidence(false)}
                >
                  <PanelRightClose size={17} />
                </button>
              </div>
              <div
                className="evidence-tabs"
                role="tablist"
                aria-label="Evidence view"
              >
                <button
                  role="tab"
                  aria-selected={tab === "code"}
                  aria-controls="evidence-content"
                  onClick={() => setTab("code")}
                  className={tab === "code" ? "active" : ""}
                >
                  <Code2 size={15} />
                  Code
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "retrieval"}
                  aria-controls="evidence-content"
                  onClick={() => setTab("retrieval")}
                  className={tab === "retrieval" ? "active" : ""}
                >
                  <Workflow size={15} />
                  Retrieval
                  <span className="tab-count">
                    {selectedAnswer?.retrieved.length ?? 0}
                  </span>
                </button>
              </div>
              <div
                id="evidence-content"
                role="tabpanel"
                className="evidence-content"
              >
                {tab === "code" ? (
                  <CodeViewer
                    repo={repo}
                    citation={citation}
                    onOpen={(c) => openCitation(c)}
                  />
                ) : (
                  <ProvenancePanel
                    answer={selectedAnswer}
                    onOpen={(c) => openCitation(c)}
                  />
                )}
              </div>
              <div className="evidence-panel-footer">
                <span className="semantic-dot" />
                Semantic search
                <span className="graph-dot" />
                Dependency graph
              </div>
            </aside>
          </>
        )}
      </div>
      <footer className="app-footer">
        <span>UNDERSTAND THE CODE. TRUST THE CONTEXT.</span>
        <span>
          Made for the curious developer <span className="footer-star">✳</span>
        </span>
      </footer>
      {showConnect && (
        <div className="modal-backdrop" onClick={() => setShowConnect(false)}>
          <div
            className="connect-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Connect a repository"
            onClick={(e) => e.stopPropagation()}
          >
            <RepoConnectForm
              onConnected={connected}
              onClose={() => setShowConnect(false)}
              disabled={isBackendBlocked}
              disabledReason={backendBlockedReason}
            />
          </div>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
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
                onClick={() => setShowHelp(false)}
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
            <button
              className="primary-button"
              onClick={() => setShowHelp(false)}
            >
              Let’s explore
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
