import { useEffect, useRef, useState } from "react";
import { Check, Code2, Copy, FileCode2, Loader2, RotateCw } from "lucide-react";
import { api } from "../api";
import { demoFiles } from "../demo";
import type { Citation, CodeFile, Repository } from "../types";
function highlight(line: string) {
  return line
    .split(
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#.*$|\b(?:from|import|def|async|class|return|if|is|None|not|True|False|await|raise|else|and|or|for|in)\b|\b\d+\b)/g,
    )
    .map((token, i) => {
      let cls = "";
      if (/^['"]/.test(token)) cls = "syntax-string";
      else if (token.startsWith("#")) cls = "syntax-comment";
      else if (
        /^(from|import|def|async|class|return|if|is|None|not|True|False|await|raise|else|and|or|for|in)$/.test(
          token,
        )
      )
        cls = "syntax-keyword";
      else if (/^\d+$/.test(token)) cls = "syntax-number";
      return (
        <span key={i} className={cls}>
          {token}
        </span>
      );
    });
}
export default function CodeViewer({
  repo,
  citation,
  onOpen,
  compactCode = false,
}: {
  repo?: Repository;
  citation: Citation | null;
  onOpen: (c: Citation) => void;
  compactCode?: boolean;
}) {
  const [file, setFile] = useState<CodeFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let current = true;
    setFile(null);
    setError("");
    if (!repo || !citation) return;
    setLoading(true);
    api
      .code(repo.id, citation.file_path, citation.start_line, citation.end_line)
      .then((f) => {
        if (current) setFile(f);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [
    repo?.id,
    citation?.file_path,
    citation?.start_line,
    citation?.end_line,
    retry,
  ]);
  useEffect(() => {
    if (file)
      lineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [file]);
  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        "Copy is unavailable in this browser. You can select the code to copy it.",
      );
    }
  };
  if (!citation)
    return (
      <div className="code-welcome">
        <div className="evidence-illustration">
          <div className="illustration-orbit" />
          <div className="illustration-card back">
            <GitLine />
          </div>
          <div className="illustration-card front">
            <Code2 size={27} />
            <span />
            <span />
            <span />
          </div>
          <span className="illustration-check">
            <Check size={14} />
          </span>
        </div>
        <h3>Go straight to the source.</h3>
        <p>
          Click any citation in an answer to see
          <br />
          the exact code behind it.
        </p>
        <div className="indexed-files">
          <div className="section-label">
            {repo?.demo ? "EXPLORE THE SAMPLE" : "YOUR CODE, IN CONTEXT"}
          </div>
          {repo?.demo ? (
            Object.keys(demoFiles).map((path, i) => (
              <button
                key={path}
                onClick={() =>
                  onOpen({
                    file_path: path,
                    start_line: i === 0 ? 10 : 1,
                    end_line:
                      i === 0
                        ? 34
                        : Math.min(16, demoFiles[path].split("\n").length),
                    valid: true,
                  })
                }
              >
                <FileCode2 size={15} />
                <span>{path}</span>
                <span className="file-arrow">↗</span>
              </button>
            ))
          ) : (
            <p className="file-empty">
              {repo
                ? "Ask your first question to explore relevant source files."
                : "Connect a repository to start exploring."}
            </p>
          )}
        </div>
        <div className="evidence-note">
          <ShieldIcon />
          <span>Every answer. Backed by code.</span>
        </div>
      </div>
    );
  return (
    <div className={`code-viewer ${compactCode ? "compact-code" : ""}`}>
      <div className="file-header">
        <FileCode2 size={15} />
        <span title={citation.file_path}>{citation.file_path}</span>
        <button
          className="icon-button small"
          aria-label="Copy code"
          title="Copy code"
          onClick={copy}
          disabled={!file}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div className="code-range">
        <span className="language-dot" />
        Python
        <span className="line-range">
          Lines {citation.start_line}–{citation.end_line}
        </span>
      </div>
      {loading ? (
        <div className="panel-state">
          <Loader2 className="spin" size={23} />
          <p>Opening source…</p>
        </div>
      ) : error ? (
        <div className="panel-state error-state">
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => setRetry((r) => r + 1)}
          >
            <RotateCw size={14} />
            Retry
          </button>
        </div>
      ) : file ? (
        <div
          className="code-scroll"
          tabIndex={0}
          aria-label={`${file.file_path} source code`}
        >
          <div className="code-lines">
            {file.content.split("\n").map((line, i) => {
              const n = file.start_line + i;
              const selected =
                n >= citation.start_line && n <= citation.end_line;
              return (
                <div
                  className={`code-line ${selected ? "highlighted" : ""}`}
                  ref={n === citation.start_line ? lineRef : undefined}
                  key={n}
                >
                  <span className="line-number" aria-hidden="true">
                    {n}
                  </span>
                  <code>{highlight(line) || " "}</code>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="code-footer">
        <span className="highlight-swatch" />
        {citation.valid
          ? "Cited lines highlighted"
          : "Citation not found in retrieved code"}
      </div>
    </div>
  );
}
function GitLine() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <path
        d="M7 5v16M19 5v5a6 6 0 0 1-6 6H7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="7"
        cy="5"
        r="3"
        fill="var(--panel)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="19"
        cy="5"
        r="3"
        fill="var(--panel)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="7"
        cy="21"
        r="3"
        fill="var(--panel)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="14" height="15" viewBox="0 0 14 15" fill="none">
      <path
        d="m7 1 5 2v4c0 3-5 6-5 6S2 10 2 7V3l5-2Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="m4.5 6.5 1.7 1.7 3.3-3.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}
