import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Code2,
  FileCode2,
  GitBranch,
  Github,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { Ingestion, Repository } from "../types";

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
    color: "purple",
  },
  {
    icon: Code2,
    tag: "FIND AN IMPLEMENTATION",
    text: "Where is the main entry point?",
    color: "amber",
  },
];

interface ChatWelcomeProps {
  repo: Repository | undefined;
  currentStats: Ingestion | undefined;
  ready: boolean;
  querying: boolean;
  onSend: (text: string) => void;
  onConnect: () => void;
}

export default function ChatWelcome({
  repo,
  currentStats,
  ready,
  querying,
  onSend,
  onConnect,
}: ChatWelcomeProps) {
  return (
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
                onClick={() => onSend(text)}
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
          <button className="primary-button" onClick={onConnect}>
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
  );
}
