"use client";

import { useState, useRef, useEffect } from "react";

interface TradeChatProps {
  opportunity: {
    symbol: string;
    optionType: string;
    strike: number;
    premium: number;
    stockPrice: number;
    expiration: string;
    score: number;
    probabilityOfProfit: number | null;
    potentialReturn: number;
    maxReturn: number;
    riskLevel: string;
    directionalBias?: {
      direction: string;
      confidence?: number;
      score?: number;
    } | null;
    enhancedDirectionalBias?: {
      direction: string;
      confidence: number;
      score: number;
      recommendation: string;
      signals: Array<{
        name: string;
        weight: number;
        direction: string;
        score: number;
        confidence: number;
        weighted_contribution: number;
        rationale: string;
      }>;
      timestamp: string;
    } | null;
    positionSizing?: {
      recommendedFraction: number;
      expectedEdge?: number;
      kellyFraction: number;
      riskBudgetTier: string;
      rationale: string[];
    } | null;
    greeks?: {
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
    };
    tradeSummary?: string;
    daysToExpiration: number;
  };
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function TradeChat({ opportunity, isOpen, onClose }: TradeChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat-about-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          opportunity: {
            symbol: opportunity.symbol,
            optionType: opportunity.optionType,
            strike: opportunity.strike,
            premium: opportunity.premium,
            stockPrice: opportunity.stockPrice,
            expiration: opportunity.expiration,
            score: opportunity.score,
            probabilityOfProfit: opportunity.probabilityOfProfit,
            potentialReturn: opportunity.potentialReturn,
            maxReturn: opportunity.maxReturn,
            riskLevel: opportunity.riskLevel,
            directionalBias: opportunity.directionalBias,
            enhancedDirectionalBias: opportunity.enhancedDirectionalBias,
            positionSizing: opportunity.positionSizing,
            greeks: opportunity.greeks,
            tradeSummary: opportunity.tradeSummary,
            daysToExpiration: opportunity.daysToExpiration,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  assistantMessage += parsed.text;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage?.role === "assistant") {
                      lastMessage.content = assistantMessage;
                    } else {
                      newMessages.push({
                        role: "assistant",
                        content: assistantMessage,
                      });
                    }
                    return newMessages;
                  });
                }
              } catch {
                // Ignore JSON parse errors
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="relative flex h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-white/20 bg-gradient-to-br from-white/30 via-white/10 to-white/5 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-2xl dark:border-white/10 dark:from-slate-900/70 dark:via-slate-900/50 dark:to-slate-900/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-blue-500/40 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-purple-500/30 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/20 bg-white/10 px-6 py-5 backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 drop-shadow-sm dark:text-white">
                💬 Desk Notes: {opportunity.symbol}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {opportunity.optionType.toUpperCase()} ${opportunity.strike} •
                Exp {opportunity.expiration} • Chat with Monty about this
                position
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-white/20 bg-white/20 p-2 text-slate-600 transition-colors hover:bg-white/30 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <svg
                className="h-6 w-6"
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

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
            {messages.length === 0 && (
              <div className="mx-auto max-w-md rounded-3xl border border-white/20 bg-white/10 px-6 py-8 text-center text-slate-600 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200">
                <p className="mb-2 text-base">
                  👋 Hi! I&apos;m here to help you analyze this trade.
                </p>
                <p className="text-sm">Ask me anything:</p>
                <ul className="mt-4 space-y-2 text-left text-sm text-slate-500 dark:text-slate-300">
                  <li>• &ldquo;Why is the expected edge negative?&rdquo;</li>
                  <li>
                    • &ldquo;What needs to happen for this to profit?&rdquo;
                  </li>
                  <li>• &ldquo;Should I take this trade?&rdquo;</li>
                  <li>• &ldquo;What are the biggest risks?&rdquo;</li>
                </ul>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-lg backdrop-blur ${
                    message.role === "user"
                      ? "border border-white/30 bg-gradient-to-r from-blue-500/80 to-indigo-500/80 text-white"
                      : "border border-white/20 bg-white/20 text-slate-900 dark:border-white/10 dark:bg-slate-900/50 dark:text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-3xl border border-white/20 bg-white/20 px-5 py-4 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-200">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500" />
                      <div
                        className="h-2.5 w-2.5 animate-bounce rounded-full bg-purple-500"
                        style={{ animationDelay: "0.12s" }}
                      />
                      <div
                        className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500"
                        style={{ animationDelay: "0.24s" }}
                      />
                    </div>
                    <span className="text-sm font-medium">
                      Monty is thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/10 bg-white/10 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about this trade..."
                disabled={isLoading}
                className="flex-1 rounded-full border border-white/20 bg-white/20 px-6 py-3 text-sm text-slate-900 placeholder-slate-500 shadow-inner transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/70 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-500/40"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(79,70,229,0.45)] transition hover:scale-[1.02] hover:shadow-[0_16px_36px_rgba(79,70,229,0.55)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
