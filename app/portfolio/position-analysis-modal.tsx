"use client";

import { useEffect, useRef, useState } from "react";
import type { Database } from "@/lib/types/database.types";
import ReactMarkdown from "react-markdown";

type Position = Database["public"]["Tables"]["positions"]["Row"];

type Message = {
  role: "user" | "assistant";
  content: string;
  isSystem?: boolean;
};

const quickPrompts = [
  "Should I exit or hold this position?",
  "What adjustments could improve this trade?",
  "How should I manage risk here?",
  "What is the profit potential from here?",
];

export default function PositionAnalysisModal({
  position,
  onClose,
}: {
  position: Position;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendButtonText, setSendButtonText] = useState("Ask Monty");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const greetings = [
      `Hey! Ready to talk about your ${position.symbol} ${position.option_type.toUpperCase()}? I've got the insights you need.`,
      `What's up! Let's dig into your ${position.symbol} ${position.option_type.toUpperCase()} position. Fire away with your questions!`,
      `Hi there! I'm Monty, your options strategist. Let's analyze your ${position.symbol} ${position.option_type.toUpperCase()} together.`,
      `Welcome back! Got questions about your ${position.symbol} ${position.option_type.toUpperCase()}? I'm here to help you nail this trade.`,
    ];

    setMessages([
      {
        role: "assistant",
        content: greetings[Math.floor(Math.random() * greetings.length)],
        isSystem: true,
      },
    ]);
    setInput("");
    setError(null);
    setIsStreaming(false);
  }, [position.id, position.option_type, position.symbol]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  const hasActiveConversation = messages.some(
    (message) => !message.isSystem && message.role === "assistant",
  );

  // Update send button text based on conversation state
  useEffect(() => {
    const buttonTexts = hasActiveConversation
      ? ["Send to Monty", "Ask Away", "Fire Away", "Send It"]
      : ["Ask Monty", "Discuss with Monty", "Consult Monty", "Ask Away"];

    // Pick a random fun text on mount or when conversation state changes
    const randomText =
      buttonTexts[Math.floor(Math.random() * buttonTexts.length)];
    setSendButtonText(randomText);
  }, [hasActiveConversation]);

  const sendMessage = async (messageContent?: string) => {
    const trimmedContent = (messageContent ?? input).trim();
    if (!trimmedContent || isStreaming) {
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: trimmedContent,
    };

    if (!messageContent) {
      setInput("");
    }

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setError(null);

    const nonSystemMessages = messages.filter((msg) => !msg.isSystem);
    const conversation = [...nonSystemMessages, userMessage];

    try {
      const response = await fetch("/api/chat-about-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.map(({ role, content }) => ({
            role,
            content,
          })),
          position: {
            symbol: position.symbol,
            strike: position.strike,
            expiration: position.expiration,
            option_type: position.option_type,
            contracts: position.contracts,
            entry_price: position.entry_price,
            entry_date: position.entry_date,
            entry_stock_price: position.entry_stock_price,
            current_price: position.current_price,
            current_stock_price: position.current_stock_price,
            unrealized_pl: position.unrealized_pl,
            unrealized_pl_percent: position.unrealized_pl_percent,
            entry_delta: position.entry_delta,
            entry_theta: position.entry_theta,
            current_delta: position.current_delta,
            current_theta: position.current_theta,
            exit_signal: position.exit_signal,
            exit_urgency_score: position.exit_urgency_score,
            exit_reasons: position.exit_reasons,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to get Monty's response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(data) as { text?: string };
            if (parsed.text) {
              assistantContent += parsed.text;
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: assistantContent,
                  };
                }
                return updated;
              });
            }
          } catch (streamError) {
            console.error("Failed to parse stream chunk", streamError);
          }
        }
      }
    } catch (err) {
      console.error("Position chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't analyze that. Please try again in a moment.",
        },
      ]);
      setError(
        err instanceof Error ? err.message : "Failed to get Monty's response",
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/30 via-white/12 to-white/5 shadow-[0_28px_90px_rgba(15,23,42,0.65)] backdrop-blur-2xl dark:border-white/10 dark:from-slate-900/70 dark:via-slate-900/50 dark:to-slate-900/25"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-blue-500/35 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-12 bottom-0 h-72 w-72 rounded-full bg-purple-500/25 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative z-10 flex max-h-[90vh] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="mb-8 flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-6 py-5 backdrop-blur-lg dark:border-white/10 dark:bg-slate-900/40">
              <h2 className="text-2xl font-semibold text-slate-900 drop-shadow-sm dark:text-white">
                Ask Monty: Position Analysis
              </h2>
              <button
                onClick={onClose}
                className="rounded-full border border-white/20 bg-white/20 p-2 text-slate-500 transition hover:bg-white/30 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Position Summary */}
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
              <div className="grid grid-cols-2 gap-5 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    Symbol
                  </div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">
                    {position.symbol}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    Position
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    ${position.strike} {position.option_type.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    P&amp;L
                  </div>
                  <div
                    className={`font-semibold ${
                      (position.unrealized_pl || 0) >= 0
                        ? "text-emerald-500"
                        : "text-rose-500"
                    }`}
                  >
                    ${(position.unrealized_pl || 0).toFixed(2)} (
                    {(position.unrealized_pl_percent || 0).toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    Exit Signal
                  </div>
                  <div
                    className={`font-semibold ${
                      position.exit_signal === "exit_now"
                        ? "text-rose-500"
                        : position.exit_signal === "consider"
                          ? "text-amber-400"
                          : "text-emerald-500"
                    }`}
                  >
                    {position.exit_signal === "exit_now"
                      ? "Exit Now"
                      : position.exit_signal === "consider"
                        ? "Consider Exit"
                        : "Hold"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
                Quick Questions
              </p>
              <div className="flex flex-wrap gap-3">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    disabled={isStreaming}
                    className="group rounded-full border border-white/20 bg-white/20 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-[0_10px_30px_rgba(148,163,184,0.25)] backdrop-blur transition-all hover:scale-105 hover:shadow-[0_18px_38px_rgba(79,70,229,0.35)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-[420px] flex-col rounded-3xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
              <div className="flex-1 space-y-4 overflow-y-auto pr-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-lg backdrop-blur ${
                        message.isSystem
                          ? "border border-white/20 bg-gradient-to-r from-blue-500/20 via-sky-400/20 to-purple-500/20 text-slate-800 dark:border-white/10 dark:text-slate-100"
                          : message.role === "user"
                            ? "border border-white/30 bg-gradient-to-r from-blue-500/80 via-indigo-500/80 to-purple-500/80 text-white"
                            : "border border-white/15 bg-white/15 text-slate-800 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                      }`}
                    >
                      {message.role === "assistant" && !message.isSystem ? (
                        <div className="prose prose-slate dark:prose-invert max-w-none">
                          <ReactMarkdown>
                            {message.content || "…"}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="rounded-3xl border border-white/15 bg-white/15 px-5 py-4 text-sm text-slate-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <div
                            className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500"
                            style={{ animationDelay: "0ms" }}
                          />
                          <div
                            className="h-2.5 w-2.5 animate-bounce rounded-full bg-purple-500"
                            style={{ animationDelay: "140ms" }}
                          />
                          <div
                            className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-400"
                            style={{ animationDelay: "280ms" }}
                          />
                        </div>
                        <span className="font-medium">
                          Monty is analyzing...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-5">
                <label htmlFor="monty-chat-input" className="sr-only">
                  Ask Monty about this position
                </label>
                <textarea
                  id="monty-chat-input"
                  ref={inputRef}
                  rows={3}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    hasActiveConversation
                      ? "Ask a follow-up question about this position..."
                      : "Ask Monty for a game plan (press Enter to send, Shift+Enter for a new line)"
                  }
                  disabled={isStreaming}
                  className="w-full rounded-2xl border border-white/15 bg-white/15 px-4 py-3 text-sm text-slate-900 shadow-inner backdrop-blur transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/40"
                />
                <div className="mt-4 flex items-center justify-between gap-3">
                  {error && <p className="text-sm text-rose-400">{error}</p>}
                  <button
                    onClick={() => sendMessage()}
                    disabled={isStreaming || !input.trim()}
                    className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(79,70,229,0.45)] transition-all hover:scale-105 hover:shadow-[0_18px_38px_rgba(79,70,229,0.6)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendButtonText}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
                    >
                      <path d="M2.94 2.939a.75.75 0 0 1 .806-.182l13 5a.75.75 0 0 1 .008 1.392l-5.216 2.24a.25.25 0 0 0-.132.132l-2.24 5.215a.75.75 0 0 1-1.392-.007l-5-13a.75.75 0 0 1 .166-.79Zm2.738 2.25 3.639 3.64a1.75 1.75 0 0 0 .694.43l4.036 1.166-3.31 1.421a1.75 1.75 0 0 0-.926.925l-1.42 3.31-1.167-4.036a1.75 1.75 0 0 0-.43-.694l-3.64-3.64Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t border-white/10 pt-6">
              <button
                onClick={onClose}
                className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-medium text-slate-700 shadow-md backdrop-blur transition hover:bg-white/20 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
