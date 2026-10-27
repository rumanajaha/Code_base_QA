import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import type { BackendState } from "./useBackendStatus";
import type { Ingestion, Repository } from "../types";

const HIDDEN_REPOS_KEY = "codebase-hidden-repos-v1";

function readHiddenIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_REPOS_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function useRepositories(backendState: BackendState) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repoError, setRepoError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [stats, setStats] = useState<Record<string, Ingestion>>({});
  const [reindexing, setReindexing] = useState(false);
  const [listRefresh, setListRefresh] = useState(0);

  // Hidden repository IDs (for backend 404/405 fallback)
  const [hiddenIds, setHiddenIds] = useState<string[]>(readHiddenIds);

  // Polling control: only poll queued or ingesting repos
  const pollingFailuresRef = useRef(0);
  const [pollingPaused, setPollingPaused] = useState(false);

  // Track ingestion start times for elapsed time display
  const ingestionStartsRef = useRef<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  const prevBackendStateRef = useRef<BackendState>(backendState);

  // Auto-reload repositories and resume polling when backend recovers to connected
  useEffect(() => {
    if (backendState === "connected") {
      pollingFailuresRef.current = 0;
      setPollingPaused(false);
      if (prevBackendStateRef.current === "unreachable" || prevBackendStateRef.current === "misconfigured") {
        setListRefresh((r) => r + 1);
      }
    }
    prevBackendStateRef.current = backendState;
  }, [backendState]);

  // Load repositories on mount and on listRefresh
  useEffect(() => {
    let alive = true;
    setLoadingRepos(true);
    setRepoError("");
    api
      .repos()
      .then((data) => {
        if (!alive) return;
        // Filter out locally hidden repositories
        const visible = data.filter((r) => !hiddenIds.includes(r.id));
        setRepos(visible);

        // Pre-populate stats if backend supplied them
        setStats((prev) => {
          const next = { ...prev };
          visible.forEach((r) => {
            if (r.files !== undefined && !next[r.id]) {
              next[r.id] = {
                status: r.status,
                files: r.files ?? 0,
                chunks: r.chunks ?? 0,
                graph_nodes: r.graph_nodes ?? 0,
                graph_edges: r.graph_edges ?? 0,
                unresolved_calls: r.unresolved_calls ?? 0,
                stage: r.stage,
                progress: r.progress,
                error: r.error,
              };
            }
          });
          return next;
        });

        // Initialize ingestion start times for any already ingesting/queued repos
        visible.forEach((r) => {
          if ((r.status === "queued" || r.status === "ingesting") && !ingestionStartsRef.current[r.id]) {
            ingestionStartsRef.current[r.id] = Date.now();
          }
        });

        setActiveId((prev) =>
          visible.some((r) => r.id === prev)
            ? prev
            : visible.find((r) => r.status === "ready")?.id || visible[0]?.id || "",
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
  }, [listRefresh, hiddenIds]);

  // Only poll repositories that are queued or ingesting (not every repository without stats)
  const ingestingRepos = repos.filter(
    (r) => r.status === "queued" || r.status === "ingesting",
  );
  const pollingIds = ingestingRepos.map((r) => r.id).join(",");

  // Timer for elapsed time ticker while ingesting
  useEffect(() => {
    if (!pollingIds) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pollingIds]);

  // Polling loop with 3-failure circuit breaker
  useEffect(() => {
    if (!pollingIds || pollingPaused) return;
    let alive = true;

    const poll = async () => {
      let anySuccess = false;
      let anyError = false;

      await Promise.allSettled(
        pollingIds.split(",").map(async (id) => {
          try {
            const next = await api.status(id);
            if (!alive) return;
            anySuccess = true;
            setStats((s) => ({ ...s, [id]: next }));
            setRepos((rs) =>
              rs.map((r) => (r.id === id ? { ...r, status: next.status } : r)),
            );
            if (next.status === "ready" || next.status === "failed") {
              delete ingestionStartsRef.current[id];
            }
          } catch {
            anyError = true;
          }
        }),
      );

      if (!alive) return;

      if (anySuccess) {
        pollingFailuresRef.current = 0;
      } else if (anyError) {
        pollingFailuresRef.current += 1;
        if (pollingFailuresRef.current >= 3) {
          setPollingPaused(true);
        }
      }
    };

    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollingIds, pollingPaused]);

  const retryPolling = () => {
    pollingFailuresRef.current = 0;
    setPollingPaused(false);
  };

  const reloadRepos = () => setListRefresh((n) => n + 1);

  const triggerReindex = async (repoId: string) => {
    setReindexing(true);
    ingestionStartsRef.current[repoId] = Date.now();
    try {
      await api.reindex(repoId);
      setRepos((rs) =>
        rs.map((r) => (r.id === repoId ? { ...r, status: "queued" } : r)),
      );
      setStats((s) => ({
        ...s,
        [repoId]: {
          status: "queued",
          files: 0,
          chunks: 0,
          graph_nodes: 0,
          graph_edges: 0,
          unresolved_calls: 0,
          progress: 0,
        },
      }));
      pollingFailuresRef.current = 0;
      setPollingPaused(false);
      return true;
    } finally {
      setReindexing(false);
    }
  };

  const handleConnected = (repoId: string) => {
    ingestionStartsRef.current[repoId] = Date.now();
    pollingFailuresRef.current = 0;
    setPollingPaused(false);
    setListRefresh((r) => r + 1);
    setActiveId(repoId);
  };

  const removeRepository = async (
    repoId: string,
    onDeleteChat?: (id: string) => void,
  ): Promise<{ hiddenLocally: boolean }> => {
    delete ingestionStartsRef.current[repoId];
    if (onDeleteChat) onDeleteChat(repoId);

    try {
      await api.deleteRepo(repoId);
      setRepos((prev) => prev.filter((r) => r.id !== repoId));
      setStats((prev) => {
        const next = { ...prev };
        delete next[repoId];
        return next;
      });
      setActiveId((curr) => {
        if (curr !== repoId) return curr;
        const remaining = repos.filter((r) => r.id !== repoId);
        return remaining.find((r) => r.status === "ready")?.id || remaining[0]?.id || "";
      });
      return { hiddenLocally: false };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        // Fallback: hide locally
        const nextHidden = [...hiddenIds, repoId];
        setHiddenIds(nextHidden);
        try {
          localStorage.setItem(HIDDEN_REPOS_KEY, JSON.stringify(nextHidden));
        } catch {
          // Ignore
        }
        setRepos((prev) => prev.filter((r) => r.id !== repoId));
        setStats((prev) => {
          const next = { ...prev };
          delete next[repoId];
          return next;
        });
        setActiveId((curr) => {
          if (curr !== repoId) return curr;
          const remaining = repos.filter((r) => r.id !== repoId && !nextHidden.includes(r.id));
          return remaining.find((r) => r.status === "ready")?.id || remaining[0]?.id || "";
        });
        return { hiddenLocally: true };
      }
      throw e;
    }
  };

  const handleResetDemo = async () => {
    await api.resetDemo();
    setRepos([]);
    setActiveId("");
    setStats({});
    ingestionStartsRef.current = {};
  };

  const getElapsedSeconds = (repoId: string): number => {
    const start = ingestionStartsRef.current[repoId];
    if (!start) return 0;
    return Math.max(0, Math.floor((now - start) / 1000));
  };

  const activeRepo = repos.find((r) => r.id === activeId);
  const currentStats = activeId ? stats[activeId] : undefined;

  return {
    repos,
    setRepos,
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
  };
}
