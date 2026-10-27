import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
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
  defaultMode: Mode = "hybrid",
  showRetrievalByDefault = false,
) {
  const [chats, setChats] = useState<Record<string, Message[]>>(readChats);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [querying, setQuerying] = useState(false);
  const [pendingRepo, setPendingRepo] = useState("");
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [tab, setTab] = useState<"code" | "retrieval">(
    showRetrievalByDefault ? "retrieval" : "code",
  );
  const [showEvidence, setShowEvidence] = useState(true);
  const [elapsedQuerySeconds, setElapsedQuerySeconds] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryTimerRef = useRef<number | null>(null);
  const prevCountRef = useRef(0);

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

  // Keep scroll position when an older answer is selected:
  // Only scroll when message count increases or querying starts
  useEffect(() => {
    if (messages.length > prevCountRef.current || querying) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, querying]);

  function openCitation(c: Citation, answerId?: string) {
    setCitation(c);
    if (answerId) setSelectedAnswerId(answerId);
    setTab("code");
    setShowEvidence(true);
  }

  function clearCitation() {
    setCitation(null);
  }

  function clearAllChats() {
    setChats({});
    setCitation(null);
    setSelectedAnswerId("");
  }

  function cancelQuery() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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
    setElapsedQuerySeconds(0);

    if (queryTimerRef.current) clearInterval(queryTimerRef.current);
    queryTimerRef.current = window.setInterval(() => {
      setElapsedQuerySeconds((s) => s + 1);
    }, 1000);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const answer = await api.query(targetRepoId, q, m, abortController.signal);
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
      setTab(showRetrievalByDefault ? "retrieval" : "code");
    } catch (e) {
      const isCancelled =
        abortController.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" || e.message.includes("cancelled")));

      if (isCancelled) {
        // Restore question to input box and clean up pending user message
        setQuestion(q);
        setChats((c) => ({
          ...c,
          [targetRepoId]: (c[targetRepoId] || []).filter((msg) => msg.id !== userMsg.id),
        }));
        setToast("Query cancelled. Question restored to input.");
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }

      const status = e instanceof ApiError ? e.status : 0;
      const is501 =
        status === 501 ||
        (e instanceof Error && e.message.includes("501"));

      if (status === 404) {
        const errorMsg: Message = {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "",
          status: 404,
          error: "Repository not found on the backend.",
          errorDetail: "The repository was removed or re-created. Please refresh the repository list.",
          retryQuestion: q,
          retryMode: m,
        };
        setChats((c) => ({
          ...c,
          [targetRepoId]: [...(c[targetRepoId] || []), errorMsg],
        }));
      } else if (status === 409) {
        const errorMsg: Message = {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "",
          status: 409,
          error: "The repository is still being indexed.",
          errorDetail: activeRepo?.stage ? `Current stage: ${activeRepo.stage}` : "Please wait for indexing to complete before asking questions.",
          retryQuestion: q,
          retryMode: m,
        };
        setChats((c) => ({
          ...c,
          [targetRepoId]: [...(c[targetRepoId] || []), errorMsg],
        }));
      } else if (status === 422) {
        const errorMsg: Message = {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "",
          status: 422,
          error: "Invalid query payload.",
          errorDetail: e instanceof Error ? e.message : "The backend rejected this query request.",
          retryQuestion: q,
          retryMode: m,
        };
        setChats((c) => ({
          ...c,
          [targetRepoId]: [...(c[targetRepoId] || []), errorMsg],
        }));
      } else if (is501) {
        const fallbackMode: Mode = m === "hybrid" ? "semantic" : "hybrid";
        const modeLabel = m.charAt(0).toUpperCase() + m.slice(1);
        const fallbackLabel =
          fallbackMode.charAt(0).toUpperCase() + fallbackMode.slice(1);
        setMode(fallbackMode);

        const errorMsg: Message = {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "",
          status: 501,
          error: `${modeLabel} mode isn't available on the backend yet. Switched to ${fallbackLabel}.`,
          errorDetail: "You can send the question using the available mode.",
          retryQuestion: q,
          retryMode: fallbackMode,
        };
        setChats((c) => ({
          ...c,
          [targetRepoId]: [...(c[targetRepoId] || []), errorMsg],
        }));
      } else {
        const errorMsg: Message = {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "",
          status: status || 0,
          error:
            e instanceof Error
              ? e.message
              : "Unable to reach the backend. Check your network connection.",
          errorDetail: "Preserved your typed question and mode. Click retry below.",
          retryQuestion: q,
          retryMode: m,
        };
        setChats((c) => ({
          ...c,
          [targetRepoId]: [...(c[targetRepoId] || []), errorMsg],
        }));
      }
    } finally {
      if (queryTimerRef.current) {
        clearInterval(queryTimerRef.current);
        queryTimerRef.current = null;
      }
      setElapsedQuerySeconds(0);
      setQuerying(false);
      setPendingRepo("");
      abortControllerRef.current = null;
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
    setTab(showRetrievalByDefault ? "retrieval" : "code");
    setToast("Started a fresh conversation.");
  }

  function exportChat() {
    const text = messages
      .map(
        (m) => `${m.role === "user" ? "You" : "Codebase"}\n${m.text || m.error}\n`,
      )
      .join("\n");
    const blob = new Blob(
      [`# ${activeRepo?.name || "Codebase"} conversation\n\n${text}`],
      {
        type: "text/markdown",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeRepo?.name || "codebase"}-chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Conversation exported.");
  }

  function deleteRepoChat(repoId: string) {
    setChats((c) => {
      const next = { ...c };
      delete next[repoId];
      try {
        localStorage.setItem("codebase-chats-v1", JSON.stringify(next));
      } catch {
        // Ignore write error
      }
      return next;
    });
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
    elapsedQuerySeconds,
    cancelQuery,
    citation,
    tab,
    setTab,
    showEvidence,
    setShowEvidence,
    endRef,
    inputRef,
    openCitation,
    clearCitation,
    clearAllChats,
    deleteRepoChat,
    send,
    newChat,
    exportChat,
  };
}
