import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Citation, Message, Mode, Repository } from "../types";

function readChats(): Record<string, Message[]> {
  try {
    return JSON.parse(
      localStorage.getItem("codebase-chats-v1") || "{}",
    ) as Record<string, Message[]>;
  } catch {
    return {};
  }
}

export function useChatSession(
  activeRepo: Repository | undefined,
  ready: boolean,
  isBackendBlocked: boolean,
  setToast: (msg: string) => void,
) {
  const [chats, setChats] = useState<Record<string, Message[]>>(readChats);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("adaptive");
  const [querying, setQuerying] = useState(false);
  const [pendingRepo, setPendingRepo] = useState("");
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [tab, setTab] = useState<"code" | "retrieval">("code");
  const [showEvidence, setShowEvidence] = useState(true);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeId = activeRepo?.id || "";
  const messages = chats[activeId] || [];
  const selectedAnswer =
    messages.find((m) => m.id === selectedAnswerId)?.answer ??
    [...messages].reverse().find((m) => m.answer)?.answer ??
    null;
  const busy = querying && pendingRepo === activeId;

  useEffect(() => {
    localStorage.setItem("codebase-chats-v1", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, querying]);

  function openCitation(c: Citation, answerId?: string) {
    setCitation(c);
    if (answerId) setSelectedAnswerId(answerId);
    setTab("code");
    setShowEvidence(true);
  }

  function clearCitation() {
    setCitation(null);
  }

  async function send(textOverride?: string, modeOverride?: Mode) {
    const q = (textOverride ?? question).trim();
    const m = modeOverride ?? mode;
    if (!q || !activeRepo || !ready || querying || isBackendBlocked) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: q,
    };

    const targetRepoId = activeRepo.id;
    setChats((c) => ({
      ...c,
      [targetRepoId]: [...(c[targetRepoId] || []), userMsg],
    }));

    if (!textOverride) setQuestion("");
    setQuerying(true);
    setPendingRepo(targetRepoId);

    try {
      const answer = await api.query(targetRepoId, q, m);
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        answer,
        text: "",
      };
      setChats((c) => ({
        ...c,
        [targetRepoId]: [...(c[targetRepoId] || []), assistantMsg],
      }));
      setSelectedAnswerId(assistantMsg.id);
      if (answer.citations[0]) setCitation(answer.citations[0]);
      setTab("code");
    } catch (e) {
      const errorMsg: Message = {
        id: `e-${Date.now()}`,
        role: "assistant",
        text: "",
        error: e instanceof Error ? e.message : "An unexpected error occurred while querying.",
        retryQuestion: q,
        retryMode: m,
      };
      setChats((c) => ({
        ...c,
        [targetRepoId]: [...(c[targetRepoId] || []), errorMsg],
      }));
    } finally {
      setQuerying(false);
      setPendingRepo("");
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
  }

  function exportChat() {
    const text = messages
      .map((m) => `${m.role === "user" ? "You" : "Codebase"}\n${m.text || m.error}\n`)
      .join("\n");
    const blob = new Blob([`# ${activeRepo?.name || "Codebase"} conversation\n\n${text}`], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeRepo?.name || "codebase"}-chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Conversation exported.");
  }

  return {
    chats,
    messages,
    selectedAnswer,
    selectedAnswerId,
    setSelectedAnswerId,
    question,
    setQuestion,
    mode,
    setMode,
    querying,
    busy,
    citation,
    tab,
    setTab,
    showEvidence,
    setShowEvidence,
    endRef,
    inputRef,
    openCitation,
    clearCitation,
    send,
    newChat,
    exportChat,
  };
}
