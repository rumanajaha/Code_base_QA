import type { Answer, CodeFile, Ingestion, Mode, Repository } from "./types";
import { demoAnswer, demoFiles, demoStats, sampleRepo } from "./demo";
const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const isDemo = !base;
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
  }
}
async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 60000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.detail ?? data?.error ?? data?.message;
      throw new ApiError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).join("; ")
            : `Request failed (${res.status}). Please try again.`,
        res.status,
      );
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === "AbortError")
      throw new ApiError("The request took too long. Please try again.");
    throw new ApiError(
      "Unable to reach the API. Check your connection and backend URL, then retry.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
// The backend and the UI name some fields differently. These adapters translate
// the backend contract (repo_id, state, lines[]) into the UI types in one place.
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
  async repos(): Promise<Repository[]> {
    if (isDemo) {
      await pause(240);
      return [...demoRepos];
    }
    const result = await request<BackendRepo[] | { repos: BackendRepo[] }>(
      "/repos",
    );
    return (Array.isArray(result) ? result : result.repos).map(normalizeRepo);
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
  async query(repo_id: string, question: string, mode: Mode): Promise<Answer> {
    if (!isDemo) {
      // Queries can be slow on a rate-limited free LLM plan, so allow 3 minutes.
      const a = await request<Answer>(
        "/query",
        { method: "POST", body: JSON.stringify({ repo_id, question, mode }) },
        180000,
      );
      return {
        ...a,
        text: a.text ?? "",
        citations: a.citations ?? [],
        retrieved: a.retrieved ?? [],
        unsupported_items: a.unsupported_items ?? [],
      };
    }
    await pause(1400);
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
