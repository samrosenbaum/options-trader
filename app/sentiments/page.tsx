import { Metadata } from "next"
import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Flame,
  LayoutGrid,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Gauge,
  LucideIcon,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import Navigation from "@/components/navigation"
import {
  fetchSentimentInsights,
  SentimentNarrative,
} from "@/lib/sentiments/intelligence"

export const metadata: Metadata = {
  title: "Sentiment Intelligence",
  description:
    "Curated bullish and bearish narratives blending options flow, news tone, and macro signals to guide your next trade.",
}

const gradientByTone: Record<"bullish" | "bearish" | "neutral", string> = {
  bullish:
    "from-emerald-500/15 via-emerald-400/10 to-transparent border-emerald-400/30 shadow-[0_20px_40px_-20px_rgba(16,185,129,0.45)]",
  bearish:
    "from-rose-500/15 via-rose-400/10 to-transparent border-rose-400/30 shadow-[0_20px_40px_-20px_rgba(244,63,94,0.45)]",
  neutral:
    "from-cyan-500/15 via-blue-400/10 to-transparent border-cyan-400/20 shadow-[0_20px_40px_-20px_rgba(6,182,212,0.35)]",
}

type SummaryItem = {
  icon: LucideIcon
  label: string
  value: string
  change: string
  tone: "bullish" | "bearish" | "neutral"
}

function SentimentStat({ stat }: { stat: SummaryItem }) {
  const Icon = stat.icon
  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:shadow-xl ${
        gradientByTone[stat.tone]
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative flex flex-col gap-4 p-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 text-slate-900 shadow-lg">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">{stat.label}</p>
          <p className="text-3xl font-semibold text-slate-900">{stat.value}</p>
          <p className="text-sm text-slate-600">{stat.change}</p>
        </div>
      </div>
    </div>
  )
}

function SentimentCard({ sentiment, type }: { sentiment: SentimentNarrative; type: "bullish" | "bearish" }) {
  const updatedDate = sentiment.lastUpdated ? new Date(sentiment.lastUpdated) : null

  return (
    <article
      className={`group relative w-full overflow-hidden rounded-3xl border border-white/10 bg-white/75 p-6 shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl dark:border-white/5 dark:bg-slate-900/70 ${
        type === "bullish"
          ? "before:absolute before:inset-0 before:bg-gradient-to-br before:from-emerald-500/10 before:via-transparent before:to-white/5"
          : "before:absolute before:inset-0 before:bg-gradient-to-br before:from-rose-500/10 before:via-transparent before:to-white/5"
      }`}
    >
      <div className="relative flex flex-col gap-8">
        <header className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/40 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
              <span>{type === "bullish" ? "Bullish" : "Bearish"}</span>
              <span className="inline-flex items-center gap-1 text-slate-900">
                {type === "bullish" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                )}
                {Math.round(Math.abs(sentiment.score) * 100)}
              </span>
            </div>
            <h3 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">
              {sentiment.symbol}
              <span className="ml-3 text-base font-medium text-slate-500">{sentiment.company}</span>
            </h3>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-end xl:gap-6">
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-slate-500">Last price</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                {typeof sentiment.price === "number" ? `$${sentiment.price.toFixed(2)}` : "—"}
              </p>
              <p className={`text-sm font-semibold ${type === "bullish" ? "text-emerald-500" : "text-rose-500"}`}>
                {sentiment.change}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/40 bg-white/70 px-4 py-3 text-center shadow-sm sm:min-w-[10rem]">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confidence</span>
              <span className="text-2xl font-semibold text-slate-900">{Math.round(sentiment.confidence * 100)}%</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">multi-source</span>
            </div>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {sentiment.catalysts.length > 0 ? (
            sentiment.catalysts.map((catalyst, index) => (
              <div
                key={`${sentiment.symbol}-catalyst-${index}`}
                className={`flex items-start gap-3 rounded-2xl border border-transparent bg-gradient-to-r px-4 py-3 text-sm font-medium leading-snug text-slate-500 shadow-inner ${
                  type === "bullish"
                    ? "from-emerald-50 via-white/40 to-transparent"
                    : "from-rose-50 via-white/40 to-transparent"
                }`}
              >
                <ShieldCheck className={`mt-0.5 h-4 w-4 ${type === "bullish" ? "text-emerald-500" : "text-rose-500"}`} />
                <span>{catalyst}</span>
              </div>
            ))
          ) : (
            <div
              className="flex items-start gap-3 rounded-2xl border border-transparent bg-gradient-to-r from-slate-100 via-white/40 to-transparent px-4 py-3 text-sm font-medium leading-snug text-slate-500 shadow-inner"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-400" />
              <span>Live catalysts will populate as fresh headlines arrive.</span>
            </div>
          )}
        </div>

        <ul className="space-y-3">
          {sentiment.rationale.length > 0 ? (
            sentiment.rationale.map((reason, index) => (
              <li
                key={`${sentiment.symbol}-${index}`}
                className="flex items-start gap-3 rounded-2xl border border-slate-200/60 bg-white/60 px-4 py-3 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300"
              >
                <ShieldCheck className={`mt-0.5 h-4 w-4 ${type === "bullish" ? "text-emerald-500" : "text-rose-500"}`} />
                <span>{reason}</span>
              </li>
            ))
          ) : (
            <li className="flex items-start gap-3 rounded-2xl border border-slate-200/60 bg-white/60 px-4 py-3 text-sm text-slate-500 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-400">
              <ShieldCheck className={`mt-0.5 h-4 w-4 ${type === "bullish" ? "text-emerald-500" : "text-rose-500"}`} />
              <span>We’re monitoring additional headlines to build conviction.</span>
            </li>
          )}
        </ul>

        <footer className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/80 text-slate-900 shadow-md ${
                type === "bullish" ? "ring-2 ring-emerald-200/60" : "ring-2 ring-rose-200/60"
              }`}
            >
              {type === "bullish" ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            </div>
            <span className="font-medium text-slate-600">
              {updatedDate
                ? `Updated ${formatDistanceToNow(updatedDate, { addSuffix: true })}`
                : "Waiting on fresh data"}
            </span>
          </div>
        </footer>
      </div>
    </article>
  )
}

export const revalidate = 300

export default async function SentimentsPage() {
  const insights = await fetchSentimentInsights()

  const secondaryInsights: SummaryItem[] = [
    {
      icon: BarChart3,
      label: "Signal consistency",
      value: `${Math.round(insights.secondary.avgConfidence * 100)}%`,
      change: `${insights.secondary.totalArticles} headlines processed over the last few sessions`,
      tone:
        insights.secondary.avgConfidence > 0.6
          ? "bullish"
          : insights.secondary.avgConfidence < 0.4
            ? "bearish"
            : "neutral",
    },
    {
      icon: Gauge,
      label: "Volatility regime",
      value: `±${insights.secondary.avgAbsChange.toFixed(2)}%`,
      change: "average intraday move across tracked symbols",
      tone:
        insights.secondary.avgAbsChange > 2
          ? "bearish"
          : insights.secondary.avgAbsChange < 1
            ? "bullish"
            : "neutral",
    },
    {
      icon: Flame,
      label: "Heat alerts",
      value: `${insights.secondary.heatAlerts.total} symbols`,
      change: `${insights.secondary.heatAlerts.bullish} bullish • ${insights.secondary.heatAlerts.bearish} bearish`,
      tone:
        insights.secondary.heatAlerts.bullish >= insights.secondary.heatAlerts.bearish
          ? "bullish"
          : "bearish",
    },
    {
      icon: LayoutGrid,
      label: "Leaders in motion",
      value:
        insights.secondary.topSymbols.length > 0
          ? insights.secondary.topSymbols.join(" · ")
          : "Gathering evidence",
      change: "highest absolute sentiment scores right now",
      tone: "neutral",
    },
  ]

  const sentimentBuckets: Record<"bullish" | "bearish", SentimentNarrative[]> = {
    bullish: insights.narratives.bullish,
    bearish: insights.narratives.bearish,
  }

  return (
    <>
      <Navigation />
      <div className="relative isolate min-h-screen overflow-hidden bg-slate-50 pb-24 pt-16 dark:bg-slate-950">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-32 top-10 h-64 w-64 rounded-full bg-emerald-400/30 blur-3xl" />
          <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -right-24 bottom-10 h-64 w-64 rounded-full bg-rose-400/25 blur-3xl" />
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                Sentiment Intelligence
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Bullish and bearish narratives from market news and sentiment analysis
              </p>
            </div>
          </div>

          <section className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {secondaryInsights.map((stat) => (
                <SentimentStat key={stat.label} stat={stat} />
              ))}
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {(Object.keys(sentimentBuckets) as Array<"bullish" | "bearish">).map((key) => (
                <div key={key} className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        {key === "bullish" ? "Bullish narratives" : "Bearish narratives"}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                        {key === "bullish" ? "Momentum on offense" : "Defensive setups"}
                      </h2>
                    </div>
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-slate-900 shadow-lg ${
                        key === "bullish" ? "ring-2 ring-emerald-200/60" : "ring-2 ring-rose-200/60"
                      }`}
                    >
                      {key === "bullish" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </div>
                  </div>
                  <div className="space-y-6">
                    {sentimentBuckets[key].length > 0 ? (
                      sentimentBuckets[key].map((sentiment) => (
                        <SentimentCard key={`${key}-${sentiment.symbol}`} sentiment={sentiment} type={key} />
                      ))
                    ) : (
                      <div className="rounded-3xl border border-dashed border-slate-200/70 bg-white/40 p-6 text-sm text-slate-500 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-400">
                        We haven't identified a strong {key} narrative yet. Stay tuned as the news tape updates.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
