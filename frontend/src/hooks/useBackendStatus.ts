import { useCallback, useEffect, useRef, useState } from "react";
import { api, configError, isDemo } from "../api";

export type BackendState = | "checking" | "connected" | "unreachable" | "misconfigured" | "demo";

export interface HealthDetails {
  status?: string; version?: string; neo4j?: boolean; chroma?: boolean; llm_configured?: boolean; errors?: Record<string, string>;[key: string]: unknown;
}

export interface BackendStatus {
  state: BackendState; latencyMs?: number; lastChecked?: Date; message?: string; details?: HealthDetails | null; retry: () => void;
}

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<Omit<BackendStatus, "retry">>(() => {
    if (isDemo) {
      return { state: "demo" };
    }
    if (configError) {
      return { state: "misconfigured", message: configError };
    }
    return { state: "checking" };
  });

  const isMounted = useRef(true);
  const timerRef = useRef<number | undefined>(undefined);
  const backoffRef = useRef(5000); // 5s, 10s, 20s, max 60s

  const checkHealth = useCallback(async () => {
    if (isDemo) {
      setStatus({ state: "demo" });
      return;
    }
    if (configError) {
      setStatus({ state: "misconfigured", message: configError });
      return;
    }

    // Do not poll if document is hidden
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    try {
      const res = await api.health();
      if (!isMounted.current) return;

      const now = new Date();
      if (res.ok) {
        // Reset exponential backoff on success
        backoffRef.current = 5000;
        setStatus({ state: "connected", latencyMs: res.latencyMs, lastChecked: now, message: undefined, details: (res.details as HealthDetails) || null, });

        // Poll every 15s when connected
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(checkHealth, 15000);
      } else {
        // Unreachable: apply exponential backoff (5s, 10s, 20s, max 60s)
        const delay = backoffRef.current;
        backoffRef.current = Math.min(60000, delay * 2);

        setStatus({
          state: "unreachable",
          latencyMs: res.latencyMs,
          lastChecked: now,
          message: res.error || "Unable to reach the backend API",
          details: (res.details as HealthDetails) || null,
        });

        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(checkHealth, delay);
      }
    } catch (err) {
      if (!isMounted.current) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(60000, delay * 2);

      setStatus({
        state: "unreachable",
        lastChecked: new Date(),
        message: err instanceof Error ? err.message : "Health check failed",
      });

      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(checkHealth, delay);
    }
  }, []);

  const retry = useCallback(() => {
    window.clearTimeout(timerRef.current);
    backoffRef.current = 5000;
    setStatus((prev) => ({
      ...prev,
      state: configError ? "misconfigured" : isDemo ? "demo" : "checking",
    }));
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    isMounted.current = true;

    if (isDemo || configError) {
      return () => {
        isMounted.current = false;
        window.clearTimeout(timerRef.current);
      };
    }

    // Immediate check on mount
    checkHealth();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkHealth();
      } else {
        window.clearTimeout(timerRef.current);
      }
    };

    const handleOnline = () => {
      backoffRef.current = 5000;
      checkHealth();
    };

    const handleOffline = () => {
      window.clearTimeout(timerRef.current);
      if (isMounted.current) {
        setStatus((prev) => ({
          ...prev,
          state: "unreachable",
          message: "Network offline: browser lost internet connection",
          lastChecked: new Date(),
        }));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isMounted.current = false;
      window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkHealth]);

  return {
    ...status,
    retry,
  };
}
