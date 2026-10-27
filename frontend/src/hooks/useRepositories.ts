import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { BackendState } from "./useBackendStatus";
import type { Ingestion, Repository } from "../types";

export function useRepositories(backendState: BackendState) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repoError, setRepoError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [stats, setStats] = useState<Record<string, Ingestion>>({});
  const [reindexing, setReindexing] = useState(false);
  const [listRefresh, setListRefresh] = useState(0);

  const prevBackendStateRef = useRef<BackendState>(backendState);

  // Auto-reload repositories when recovering from unreachable to connected
  useEffect(() => {
    if (
      prevBackendStateRef.current === "unreachable" &&
      backendState === "connected"
    ) {
      setListRefresh((r) => r + 1);
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

  // Poll status for queued / ingesting repositories
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
            const next = await api.status(id);
            if (!alive) return;
            setStats((s) => ({ ...s, [id]: next }));
            setRepos((rs) =>
              rs.map((r) => (r.id === id ? { ...r, status: next.status } : r)),
            );
          } catch {
            // Ignore polling errors
          }
        }),
      );
    };
    void poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollingIds]);

  const reloadRepos = () => setListRefresh((n) => n + 1);

  const triggerReindex = async (repoId: string) => {
    setReindexing(true);
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
      return true;
    } catch (e) {
      throw e;
    } finally {
      setReindexing(false);
    }
  };

  const handleConnected = (repoId: string) => {
    setListRefresh((r) => r + 1);
    setActiveId(repoId);
  };

  const handleResetDemo = async () => {
    await api.resetDemo();
    setRepos([]);
    setActiveId("");
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
  };
}
