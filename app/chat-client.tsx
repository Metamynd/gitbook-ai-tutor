"use client";

import { useEffect, useRef, useState } from "react";
import { BrandHeader } from "./components/brand-header";
import { Markdown } from "./components/markdown";
import { QuizCard, type QuizQuestion, type QuizEvaluationResult } from "./components/quiz-card";
import { BASE_PATH } from "./lib/base-path";

type Source = { id: string; title: string; url?: string; section?: string };
type Topic = { id: string; title: string };
type LearnerLevel = "beginner" | "intermediate" | "developer" | "advanced";

type TextChatMessage = {
  kind: "text";
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type QuizChatMessage = {
  kind: "quiz";
  question: QuizQuestion;
  evaluation: QuizEvaluationResult | null;
  submitting: boolean;
};

type ChatMessage = TextChatMessage | QuizChatMessage;

type TutorEvent =
  | { type: "retrieval_started" }
  | { type: "retrieval_complete"; sources: Source[] }
  | { type: "text_delta"; delta: string }
  | { type: "text_complete"; text: string }
  | { type: "complete" }
  | { type: "error"; code: string; message: string };

const ANONYMOUS_ID_KEY = "tutor_anonymous_id";
const LEVELS: { value: LearnerLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "developer", label: "Developer" },
  { value: "advanced", label: "Advanced" },
];

function getOrCreateAnonymousId(): string {
  const existing = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(ANONYMOUS_ID_KEY, id);
  return id;
}

export function ChatClient() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [tutorName, setTutorName] = useState<string>("Tutor");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizTopicId, setQuizTopicId] = useState<string>("");
  const [overallLevel, setOverallLevel] = useState<LearnerLevel | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Scrolls to the start of the newest turn, not the bottom of the list —
  // otherwise every streamed token re-triggers a scroll-to-bottom and the
  // user can't start reading until the response finishes and they scroll
  // back up. Only refs the latest user text message; see the length-keyed
  // effect below.
  const latestUserMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = getOrCreateAnonymousId();
    setAnonymousId(id);

    fetch(`${BASE_PATH}/api/tutor/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSessionId(data.sessionId);
        setProductName(data.product ?? "");
        setTutorName(data.tutorName ?? "Tutor");
        setTopics(data.topics ?? []);
        setQuizTopicId(data.topics?.[0]?.id ?? "");
        setOverallLevel(data.overallLevel ?? null);
      })
      .catch(() => setError("Couldn't start a session. Try refreshing the page."));
  }, []);

  useEffect(() => {
    // Keyed on length, not the array itself: length only changes when a new
    // message is pushed, not on every text_delta that mutates the last
    // message in place. That's what keeps this from firing mid-stream.
    latestUserMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [messages.length]);

  async function chooseLevel(level: LearnerLevel) {
    if (!anonymousId) return;
    setOverallLevel(level);
    try {
      await fetch(`${BASE_PATH}/api/learner/level`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId, level }),
      });
    } catch {
      // Non-critical to this turn — level just won't stick for next time.
    }
  }

  async function sendMessage(text: string) {
    if (!sessionId || !anonymousId || isStreaming) return;

    setError(null);
    setMessages((prev) => [...prev, { kind: "text", role: "user", content: text }]);
    setInput("");
    setIsStreaming(true);
    setStatus("Thinking...");

    let assistantText = "";
    let assistantSources: Source[] = [];
    setMessages((prev) => [...prev, { kind: "text", role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${BASE_PATH}/api/tutor/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, anonymousId, message: text }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event: TutorEvent = JSON.parse(line);

          if (event.type === "retrieval_started") setStatus("Checking documentation...");
          if (event.type === "retrieval_complete") {
            assistantSources = event.sources;
            setStatus("Thinking...");
          }
          if (event.type === "text_delta") {
            assistantText += event.delta;
            setStatus(null);
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { kind: "text", role: "assistant", content: assistantText, sources: assistantSources };
              return next;
            });
          }
          if (event.type === "error") {
            setError(event.message);
          }
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { kind: "text", role: "assistant", content: assistantText, sources: assistantSources };
        return next;
      });
    } catch {
      setError("The tutor is temporarily unavailable.");
    } finally {
      setIsStreaming(false);
      setStatus(null);
    }
  }

  async function startQuiz() {
    if (!anonymousId || !quizTopicId || isStreaming) return;
    const topic = topics.find((t) => t.id === quizTopicId);
    if (!topic) return;

    setError(null);
    setMessages((prev) => [...prev, { kind: "text", role: "user", content: `Quiz me on ${topic.title}` }]);
    setIsStreaming(true);
    setStatus("Preparing a question...");

    try {
      const res = await fetch(`${BASE_PATH}/api/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId, topicId: quizTopicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMessages((prev) => [...prev, { kind: "quiz", question: data.question, evaluation: null, submitting: false }]);
    } catch {
      setError("Couldn't generate a quiz question right now.");
    } finally {
      setIsStreaming(false);
      setStatus(null);
    }
  }

  async function submitQuizAnswer(index: number, answer: string) {
    const msg = messages[index];
    if (!msg || msg.kind !== "quiz" || msg.submitting || msg.evaluation) return;

    setMessages((prev) => {
      const next = [...prev];
      next[index] = { ...msg, submitting: true };
      return next;
    });

    try {
      const res = await fetch(`${BASE_PATH}/api/quiz/${msg.question.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId, sessionId, question: msg.question, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...(next[index] as QuizChatMessage), evaluation: data.evaluation, submitting: false };
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...(next[index] as QuizChatMessage), submitting: false };
        return next;
      });
      setError("Couldn't grade that answer right now.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (text) sendMessage(text);
  }

  const suggestions = productName
    ? [
        `What is ${productName}?`,
        `Teach me ${productName} from the beginning.`,
        "I am a developer. Show me where to start.",
      ]
    : [];

  // The last user text message, wherever it is — NOT a fixed length-2
  // offset. That assumption held for sendMessage (which pushes
  // user+assistant-placeholder together) but breaks for the quiz flow (a
  // single user-text push, then a separate quiz card pushed later once
  // generation finishes).
  const lastUserIndex = messages.reduce(
    (acc, m, i) => (m.kind === "text" && m.role === "user" ? i : acc),
    -1
  );

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <BrandHeader subtitle={productName ? `Learn ${productName} interactively` : undefined} />
        <a
          href={`${BASE_PATH}/progress`}
          className="mt-1 shrink-0 font-mono text-xs uppercase tracking-wide text-gray-400 hover:text-[#6366F1]"
        >
          My progress
        </a>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto py-4">
        {overallLevel === null && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-brand-slate">What's your experience level?</p>
            <p className="mt-1 text-xs text-gray-500">
              This changes how {tutorName} explains things — you can't get this wrong, it's just a starting point.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => chooseLevel(l.value)}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-slate transition hover:border-transparent hover:bg-gradient-brand-soft"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wide text-gray-400">Try asking</p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="block w-full rounded-2xl border border-gray-200 bg-white p-3 text-left text-sm text-brand-slate transition hover:border-transparent hover:bg-gradient-brand-soft"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.kind === "quiz") {
            return (
              <QuizCard
                key={i}
                question={m.question}
                evaluation={m.evaluation}
                submitting={m.submitting}
                onSubmit={(answer) => submitQuizAnswer(i, answer)}
              />
            );
          }

          return (
            <div key={i} ref={i === lastUserIndex ? latestUserMessageRef : undefined}>
              <div className="mb-1 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-gray-400">
                <span
                  className={
                    m.role === "assistant" ? "h-1.5 w-1.5 rounded-full bg-gradient-brand-primary" : "h-1.5 w-1.5 rounded-full bg-gray-300"
                  }
                />
                {m.role === "user" ? "You" : tutorName}
              </div>
              {m.role === "assistant" && m.content ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                <div className="whitespace-pre-wrap text-sm text-brand-slate">{m.content || "…"}</div>
              )}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 text-xs">
                  <div className="font-mono uppercase tracking-wide text-gray-400">Sources</div>
                  <ul className="mt-1.5 space-y-1 font-mono">
                    {m.sources.map((s) => (
                      <li key={s.id}>
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#6366F1] underline decoration-[#6366F1]/30 underline-offset-2 hover:decoration-[#6366F1]"
                          >
                            {s.title}
                          </a>
                        ) : (
                          s.title
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {status && <div className="font-mono text-xs italic text-gray-400">{status}</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      {topics.length > 0 && (
        <div className="flex items-center gap-2 border-t border-black/5 pt-3 text-xs">
          <select
            value={quizTopicId}
            onChange={(e) => setQuizTopicId(e.target.value)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-brand-slate"
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            onClick={startQuiz}
            disabled={!sessionId || isStreaming}
            className="rounded-full border border-gray-200 px-3 py-1 font-medium text-brand-slate transition hover:border-transparent hover:bg-gradient-brand-soft disabled:opacity-40"
          >
            Quiz me
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask anything about ${productName || "..."}`}
          disabled={!sessionId || isStreaming}
          className="flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
        />
        <button
          type="submit"
          disabled={!sessionId || isStreaming || !input.trim()}
          className="rounded-full bg-gradient-brand-primary px-5 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
