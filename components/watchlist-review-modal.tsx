"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { MontyLoading } from "@/components/monty-loading";

interface WatchlistReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Array<{
    id: string;
    symbol: string;
    optionType: string;
    strike: number;
    premium: number;
    score?: number | null;
    riskLevel?: string | null;
    daysToExpiration?: number | null;
    tradeSummary?: string | null;
    expiration: string;
    addedAt: string;
  }>;
  priceData?: Record<
    string,
    {
      currentPremium: number | null;
      plAmount: number | null;
      plPercent: number | null;
    }
  >;
}

export default function WatchlistReviewModal({
  isOpen,
  onClose,
  items,
  priceData,
}: WatchlistReviewModalProps) {
  const [analysis, setAnalysis] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const runAnalysis = async () => {
    setIsLoading(true);
    setError("");
    setAnalysis("");

    try {
      const response = await fetch("/api/review-watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, priceData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to review watchlist");
      }

      setAnalysis(data.analysis);
    } catch (err) {
      console.error("Review error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to review watchlist",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run analysis when modal opens
  useEffect(() => {
    if (isOpen && !analysis && !isLoading) {
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/20 via-white/10 to-white/5 shadow-[0_28px_90px_rgba(15,23,42,0.65)] backdrop-blur-2xl dark:border-white/10 dark:from-slate-900/70 dark:via-slate-900/50 dark:to-slate-900/30"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-blue-500/35 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-purple-500/25 blur-[120px]"
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/10 px-6 py-5 backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-gradient-to-br from-blue-500/60 via-indigo-500/60 to-purple-500/60 shadow-lg">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Monty's Watchlist Review
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Analyzing {items.length}{" "}
                  {items.length === 1 ? "option" : "options"} from your
                  watchlist
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-white/20 bg-white/20 p-2 text-slate-500 transition hover:bg-white/30 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {isLoading && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/10 px-8 py-12 text-slate-600 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300">
                <MontyLoading />
                <p className="mt-6 text-center text-sm">
                  Monty is analyzing your watchlist...
                  <br />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Considering portfolio balance, time decay, and opportunity
                    quality
                  </span>
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-3xl border border-rose-400/30 bg-rose-500/15 px-6 py-6 text-center text-rose-100 shadow-lg backdrop-blur">
                <p className="text-base font-semibold">Analysis Failed</p>
                <p className="mt-2 text-sm opacity-80">{error}</p>
                <button
                  onClick={runAnalysis}
                  className="mt-4 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                >
                  Try Again
                </button>
              </div>
            )}

            {analysis && !isLoading && (
              <div className="rounded-3xl border border-white/10 bg-white/10 px-6 py-6 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  {analysis}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {analysis && !isLoading && (
            <div className="border-t border-white/10 bg-white/10 px-6 py-5 backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
              <div className="flex flex-col gap-4 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex-1 text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                  💡 Tip: Consider entering your highest-priority options first,
                  then reassess
                </p>
                <button
                  onClick={onClose}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(16,185,129,0.35)] transition hover:shadow-[0_16px_36px_rgba(16,185,129,0.45)]"
                >
                  Got It
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
