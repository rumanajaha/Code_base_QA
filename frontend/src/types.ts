export type Mode = "baseline" | "semantic" | "hybrid" | "adaptive";
export type RepoState = "queued" | "ingesting" | "ready" | "failed";
export interface Repository {
  id: string;
  name: string;
  url: string;
  branch: string;
  status: RepoState;
  demo?: boolean;
  files?: number;
  chunks?: number;
  graph_nodes?: number;
  graph_edges?: number;
  unresolved_calls?: number;
  stage?: string;
  progress?: number;
  error?: string;
  already_indexed?: boolean;
}
export interface Ingestion {
  status: RepoState;
  files: number;
  chunks: number;
  graph_nodes: number;
  graph_edges: number;
  unresolved_calls: number;
  progress?: number;
  stage?: string;
  error?: string;
}
export interface Citation {
  file_path: string;
  start_line: number;
  end_line: number;
  valid: boolean;
}
export interface Chunk {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  node_type: string;
  name: string;
  qualified_name: string;
}
export interface Retrieved {
  chunk: Chunk;
  score: number | null;
  source: "semantic" | "graph";
  via: string | null;
  rank: number;
}
export interface Answer {
  text: string;
  citations: Citation[];
  retrieved: Retrieved[];
  query_type: string | null;
  grounding_score: number | null;
  low_confidence: boolean;
  unsupported_items: unknown[];
  mode: Mode;
  latency_ms: number;
  tokens_used: number | null;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: Answer;
  error?: string;
  status?: number;
  errorDetail?: string;
  retryQuestion?: string;
  retryMode?: Mode;
}
export interface CodeFile {
  file_path: string;
  content: string;
  start_line: number;
  end_line: number;
}
export interface HealthResult {
  ok: boolean;
  latencyMs: number;
  details?: unknown;
  error?: string;
}
