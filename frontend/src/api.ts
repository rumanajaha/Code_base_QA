import type { Answer, CodeFile, HealthResult, Ingestion, Mode, Repository, } from "./types";
import { demoAnswer, demoFiles, demoStats, sampleRepo } from "./demo";

// 1) Base URL validation at module load
const rawUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
let apiBase = rawUrl;
let configError: string | null = null;
const isDemo = !rawUrl;

if (rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      configError =
        "VITE_API_URL must start with http:// or https://, for example http://127.0.0.1:8000";
    } else if (
      typeof window !== "undefined" &&
      window.location &&
      parsed.origin === window.location.origin
    ) {
      const portStr =
        parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      configError = `VITE_API_URL points at the frontend itself (port ${portStr}); it must be the backend address`;
    }
  } catch {
    configError =
      "VITE_API_URL must start with http:// or https://, for example http://127.0.0.1:8000";
  }
}

export { apiBase, isDemo, configError };

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const storageKey = "codebase-demo-repos-v1";
function readRepos(): Repository[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [sampleRepo];
  } catch {
    return [sampleRepo];
  }
}
let demoRepos: Repository[] = readRepos();
const starts = new Map<string, number>();
function save() {
  localStorage.setItem(storageKey, JSON.stringify(demoRepos));
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// 3) Error bodies: parse FastAPI details or map status codes
function parseErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const formatted = detail.map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const loc = (item as { loc?: unknown[] }).loc;
          const msg = (item as { msg?: string }).msg || "Invalid value";
          if (Array.isArray(loc) && loc.length > 0) {
            const field = loc.filter((part) => part !== "body").join(".");
            return field ? `${field}: ${msg}` : msg;
          }
          return msg;
        }
        return String(item);
      });
      return formatted.join("; ");
    }
    const fallbackMsg =
      (data as { error?: unknown }).error ??
      (data as { message?: unknown }).message;
    if (typeof fallbackMsg === "string" && fallbackMsg.trim()) {
      return fallbackMsg;
    }
  }

  if (status === 404) return "Not found";
  if (status === 409) return "The repository is still being indexed";
  if (status === 422) return "The request was invalid";
  if (status === 501) return "This feature is not available on the backend yet";
  if (status >= 500 && status < 600)
    return "The backend had an error; check its terminal";
  return `Request failed (${status}). Please try again.`;
}

// 2) request() with error handling, DEV logging, and signal support
async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 60000,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (configError) {
    throw new ApiError(configError, 0);
  }

  const fullUrl = apiBase + path;
  const method = (init?.method || "GET").toUpperCase();
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let onAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new ApiError("The request was cancelled.", 0);
    }
    onAbort = () => controller.abort();
    externalSignal.addEventListener("abort", onAbort);
  }

  try {
    const res = await fetch(fullUrl, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    const duration = Date.now() - startTime;
    if (import.meta.env.DEV) {
      console.debug(`${method} ${fullUrl} -> ${res.status} in ${duration} ms`);
    }

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      const message = parseErrorMessage(data, res.status);
      throw new ApiError(message, res.status);
    }

    if (!isJson || data === null || data === undefined) {
      throw new ApiError(
        `The server at ${fullUrl} did not return JSON. Check that VITE_API_URL points to the FastAPI backend.`,
        res.status,
      );
    }

    return data as T;
  } catch (e) {
    const duration = Date.now() - startTime;
    if (import.meta.env.DEV && !(e instanceof ApiError)) {
      console.debug(`${method} ${fullUrl} -> error in ${duration} ms`);
    }

    if (e instanceof ApiError) throw e;

    if (externalSignal?.aborted) {
      throw new ApiError("The request was cancelled.", 0);
    }
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError("The request took too long. Please try again.", 0);
    }
    if (e instanceof TypeError) {
      const origin =
        typeof window !== "undefined" && window.location
          ? window.location.origin
          : "the frontend origin";
      throw new ApiError(
        `Unable to reach ${fullUrl}. Is the backend running? Is ${origin} in the backend CORS_ORIGINS?`,
        0,
      );
    }

    throw new ApiError(
      `Unable to reach the API at ${fullUrl}. Check your connection and backend URL, then retry.`,
      0,
    );
  } finally {
    clearTimeout(timer);
    if (externalSignal && onAbort) {
      externalSignal.removeEventListener("abort", onAbort);
    }
  }
}

// Adapters translating backend fields to UI types
type BackendRepo = Partial<Repository> & {
  repo_id?: string;
  repo_url?: string;
  state?: Repository["status"];
};
function normalizeRepo(r: BackendRepo): Repository {
  const id = r.id ?? r.repo_id ?? "";
  const name = r.name ?? id.replace("__", "/");
  return {
    id,
    name: name || "Repository",
    url:
      r.url ??
      r.repo_url ??
      (id.includes("__") ? `https://github.com/${name}` : ""),
    branch: r.branch || "default",
    status: r.status ?? r.state ?? "queued",
    demo: r.demo,
    files: r.files,
    chunks: r.chunks,
    graph_nodes: r.graph_nodes,
    graph_edges: r.graph_edges,
    unresolved_calls: r.unresolved_calls,
    stage: r.stage,
    progress: r.progress,
    error: r.error,
  };
}
type BackendStatus = Partial<Ingestion> & { state?: Ingestion["status"] };
type BackendCode = Partial<CodeFile> & {
  file?: string;
  start?: number;
  end?: number;
  lines?: { n: number; text: string }[];
};

export const api = {
  // 4) repos() accepting [], an array, or { repos: [...] }
  async repos(): Promise<Repository[]> {
    if (isDemo) {
      await pause(240);
      return demoRepos.map((r) =>
        r.status === "ready" ? { ...demoStats, ...r, status: r.status } : r,
      );
    }
    const result = await request<unknown>("/repos");
    let list: BackendRepo[];
    if (Array.isArray(result)) {
      list = result;
    } else if (
      result &&
      typeof result === "object" &&
      Array.isArray((result as { repos?: unknown }).repos)
    ) {
      list = (result as { repos: BackendRepo[] }).repos;
    } else {
      throw new ApiError(
        "Unexpected response format from /repos: expected an array or { repos: [...] }",
        200,
      );
    }
    return list.map(normalizeRepo);
  },

  async connect(url: string, branch: string): Promise<Repository> {
    if (!isDemo) {
      const data = await request<BackendRepo>("/repos", {
        method: "POST",
        body: JSON.stringify({ repo_url: url, branch: branch || undefined }),
      });
      return normalizeRepo({ repo_url: url, branch, state: "queued", ...data });
    }
    await pause(550);
    if (demoRepos.some((r) => r.url === url && r.branch === (branch || "main")))
      throw new ApiError("This repository and branch are already connected.");
    const repo: Repository = {
      id: crypto.randomUUID(),
      url,
      name: url
        .replace(/\.git$/, "")
        .split("/")
        .pop()!,
      branch: branch || "main",
      status: "queued",
      demo: true,
    };
    demoRepos.push(repo);
    starts.set(repo.id, Date.now());
    save();
    return repo;
  },

  async status(id: string): Promise<Ingestion> {
    if (!isDemo) {
      const d = await request<BackendStatus>(
        `/repos/${encodeURIComponent(id)}/status`,
      );
      if (!d || typeof d !== "object") {
        throw new ApiError(
          "Unexpected response format from /status: expected an object",
          200,
        );
      }
      return {
        files: 0,
        chunks: 0,
        graph_nodes: 0,
        graph_edges: 0,
        unresolved_calls: 0,
        ...d,
        status: d.status ?? d.state ?? "queued",
      };
    }
    await pause(180);
    const repo = demoRepos.find((r) => r.id === id);
    if (!repo) throw new ApiError("Repository not found.", 404);
    if (repo.status === "ready") return { ...demoStats };
    if (repo.status === "failed")
      return {
        ...demoStats,
        status: "failed",
        error: "Indexing failed. Re-index the repository to retry.",
      };
    if (!starts.has(id)) starts.set(id, Date.now());
    const p = Math.min(100, Math.round((Date.now() - starts.get(id)!) / 90));
    repo.status = p === 100 ? "ready" : "ingesting";
    save();
    return {
      ...demoStats,
      status: repo.status,
      progress: p,
      files: Math.round((24 * p) / 100),
      chunks: Math.round((86 * p) / 100),
      graph_nodes: Math.round((112 * p) / 100),
      graph_edges: Math.round((148 * p) / 100),
      stage:
        p < 30
          ? "Reading Python files"
          : p < 65
            ? "Building code chunks"
            : p < 90
              ? "Mapping dependencies"
              : "Finishing the index",
    };
  },

  // 7) query() with optional AbortSignal parameter
  async query(
    repo_id: string,
    question: string,
    mode: Mode,
    signal?: AbortSignal,
  ): Promise<Answer> {
    if (!isDemo) {
      // Queries can be slow on a rate-limited free LLM plan, so allow 3 minutes.
      const a = await request<Answer>(
        "/query",
        { method: "POST", body: JSON.stringify({ repo_id, question, mode }) },
        180000,
        signal,
      );
      if (
        !a ||
        typeof a !== "object" ||
        typeof a.text !== "string" ||
        !Array.isArray(a.citations) ||
        !Array.isArray(a.retrieved)
      ) {
        throw new ApiError(
          "Unexpected response format from /query: missing text, citations, or retrieved array",
          200,
        );
      }
      return {
        ...a,
        text: a.text ?? "",
        citations: a.citations ?? [],
        retrieved: a.retrieved ?? [],
        unsupported_items: a.unsupported_items ?? [],
      };
    }
    if (signal?.aborted) throw new ApiError("The request was cancelled.", 0);
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1400);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            reject(new ApiError("The request was cancelled.", 0));
          },
          { once: true },
        );
      }
    });
    return demoAnswer(question, mode);
  },

  async code(
    repo_id: string,
    file: string,
    start: number,
    end: number,
  ): Promise<CodeFile> {
    if (isDemo) {
      await pause(260);
      const content = demoFiles[file];
      if (!content)
        throw new ApiError(
          "This file is not available in the sample repository.",
          404,
        );
      return {
        file_path: file,
        content,
        start_line: 1,
        end_line: content.split("\n").length,
      };
    }
    const params = new URLSearchParams({
      file,
      start: String(Math.max(1, start - 8)),
      end: String(end + 12),
    });
    const data = await request<BackendCode | string>(
      `/repos/${encodeURIComponent(repo_id)}/code?${params}`,
    );
    if (!data || (typeof data !== "object" && typeof data !== "string")) {
      throw new ApiError("Unexpected response format from /code", 200);
    }
    const fallbackStart = Math.max(1, start - 8);
    if (typeof data === "string")
      return {
        file_path: file,
        content: data,
        start_line: fallbackStart,
        end_line: end + 12,
      };
    if (data.lines) {
      // backend format: lines = [{ n: 12, text: "..." }, ...]
      const last = data.lines[data.lines.length - 1];
      return {
        file_path: data.file ?? data.file_path ?? file,
        content: data.lines.map((l) => l.text).join("\n"),
        start_line: data.lines[0]?.n ?? data.start ?? fallbackStart,
        end_line: last?.n ?? data.end ?? end + 12,
      };
    }
    return {
      file_path: data.file_path ?? data.file ?? file,
      content: data.content ?? "",
      start_line: data.start_line ?? data.start ?? fallbackStart,
      end_line: data.end_line ?? data.end ?? end + 12,
    };
  },

  // 5) health(): GET /health with a 5 second timeout, never throws
  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      if (isDemo) {
        await pause(80);
        return {
          ok: true,
          latencyMs: Date.now() - start,
          details: { status: "ok", mode: "demo" },
        };
      }
      const data = await request<unknown>("/health", undefined, 5000);
      return {
        ok: true,
        latencyMs: Date.now() - start,
        details: data,
      };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : "Health check failed",
      };
    }
  },

  // 6) deleteRepo(id): DELETE /repos/{id}
  async deleteRepo(id: string): Promise<void> {
    if (!isDemo) {
      try {
        await request(`/repos/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          throw new ApiError(
            e.status === 405 || e.message.toLowerCase().includes("not allowed")
              ? "Repository deletion is not supported by the backend."
              : e.message,
            e.status,
          );
        }
        throw e;
      }
      return;
    }
    await pause(240);
    demoRepos = demoRepos.filter((r) => r.id !== id);
    save();
  },

  async reindex(id: string): Promise<void> {
    if (!isDemo) {
      await request(`/repos/${encodeURIComponent(id)}/reindex`, {
        method: "POST",
      });
      return;
    }
    await pause(300);
    const r = demoRepos.find((r) => r.id === id);
    if (r) {
      r.status = "queued";
      starts.set(id, Date.now());
      save();
    }
  },

  async resetDemo(): Promise<void> {
    if (!isDemo) return;
    demoRepos = [];
    save();
  },
};
