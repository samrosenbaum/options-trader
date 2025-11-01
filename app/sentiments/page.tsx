import { Metadata } from "next"
import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Flame,
  LayoutGrid,
  Layers,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Zap,
  ShieldCheck,
  Gauge,
  LucideIcon,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Navigation from "@/components/navigation"

const heroStats = [
  {
    label: "Bullish conviction",
    value: "82%",
    change: "+6.4% WoW",
    icon: TrendingUp,
    tone: "bullish" as const,
  },
  {
    label: "Bearish conviction",
    value: "38%",
    change: "-3.1% WoW",
    icon: TrendingDown,
    tone: "bearish" as const,
  },
  {
    label: "Flow alignment",
    value: "72%",
    change: "Across smart money",
    icon: Layers,
    tone: "neutral" as const,
  },
]

const sentimentBuckets = {
  bullish: [
    {
      symbol: "NVDA",
      company: "NVIDIA Corporation",
      price: 903.12,
      change: "+2.8%",
      score: 0.84,
      confidence: 0.78,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      catalysts: ["AI demand breakout", "Dark pool call surge"],
      rationale: [
        "Institutional call flow up 46% vs 20-day avg with positive gamma regime.",
        "Six of the last seven analyst notes flipped bullish with above-average conviction.",
        "News tone skewing 0.72 bullish with focus on data center backlog.",
      ],
    },
    {
      symbol: "TSLA",
      company: "Tesla Inc.",
      price: 248.51,
      change: "+1.9%",
      score: 0.79,
      confidence: 0.74,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      catalysts: ["Record deliveries", "Retail flow acceleration"],
      rationale: [
        "Retail sentiment flipped positive with 19% jump in call volume vs prior week.",
        "Macro regime improving as rates cool; volatility compression favors upside re-pricing.",
        "Earnings revisions trending higher the past two sessions.",
      ],
    },
    {
      symbol: "MSFT",
      company: "Microsoft Corp.",
      price: 415.22,
      change: "+0.8%",
      score: 0.71,
      confidence: 0.69,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      catalysts: ["Azure share gains", "AI copilots adoption"],
      rationale: [
        "Enterprise deal tracker shows 12 mega deals signed this week with AI upsell components.",
        "Implied volatility remains under 25th percentile while momentum stays positive.",
        "Earnings call sentiment trending bullish across transcripts scanned.",
      ],
    },
  ],
  bearish: [
    {
      symbol: "AAPL",
      company: "Apple Inc.",
      price: 182.94,
      change: "-1.4%",
      score: -0.62,
      confidence: 0.67,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      catalysts: ["Supply chain stress", "Options skew defensive"],
      rationale: [
        "Put/call skew at 3-month highs while dealers reducing long gamma exposure.",
        "News tone tilted -0.58 after regulatory headlines out of EU.",
        "Regional shipment data signals softer demand, dragging revenue models lower.",
      ],
    },
    {
      symbol: "NFLX",
      company: "Netflix Inc.",
      price: 386.45,
      change: "-2.3%",
      score: -0.55,
      confidence: 0.61,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      catalysts: ["Subscriber miss risk", "Content spend spike"],
      rationale: [
        "Preview data from credit cards shows streaming churn ticked higher week-over-week.",
        "IV rank at 74 suggests elevated hedge demand into next catalyst window.",
        "Sentiment from 12 recent articles scores -0.49 with focus on competition pressures.",
      ],
    },
    {
      symbol: "PYPL",
      company: "PayPal Holdings",
      price: 61.37,
      change: "-1.1%",
      score: -0.48,
      confidence: 0.58,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
      catalysts: ["Margin compression", "Fintech outflows"],
      rationale: [
        "Smart money flow leaning short with 63% of dark pool prints on bid.",
        "Management commentary around take-rate pressure continues to trend negative.",
        "Macro fintech basket underperforming SPY by 420 bps month-to-date.",
      ],
    },
  ],
}

type SentimentKey = keyof typeof sentimentBuckets

type SentimentDescriptor = "bullish" | "bearish"

type SummaryItem = {
  icon: LucideIcon
  label: string
  value: string
  change: string
  tone: "bullish" | "bearish" | "neutral"
}

const secondaryInsights: SummaryItem[] = [
  {
    icon: BarChart3,
    label: "Signal consistency",
    value: "92%",
    change: "multi-source alignment",
    tone: "bullish",
  },
  {
    icon: Gauge,
    label: "Volatility regime",
    value: "Calm to positive",
    change: "VIX drifting lower",
    tone: "neutral",
  },
  {
    icon: Flame,
    label: "Heat alerts",
    value: "14 names",
    change: "high momentum",
    tone: "bullish",
  },
  {
    icon: LayoutGrid,
    label: "Sectors in motion",
    value: "8 of 11",
    change: "led by Tech, Discretionary",
    tone: "neutral",
  },
]

const recentSignals = [
  {
    id: "1",
    label: "Semis rip higher",
    detail: "Philadelphia Semiconductor Index up 3.2% with upbeat order commentary.",
    time: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    direction: "bullish" as SentimentDescriptor,
  },
  {
    id: "2",
    label: "Macro easing",
    detail: "CPI swap pricing shows inflation expectations cooling next quarter.",
    time: new Date(Date.now() - 1000 * 60 * 26).toISOString(),
    direction: "bullish" as SentimentDescriptor,
  },
  {
    id: "3",
    label: "Consumer fatigue",
    detail: "Card spend trackers roll over, pressuring discretionary cohort.",
    time: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    direction: "bearish" as SentimentDescriptor,
  },
  {
    id: "4",
    label: "Flow defensive",
    detail: "ETF options show put demand picking up in financials.",
    time: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    direction: "bearish" as SentimentDescriptor,
  },
]

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

function SentimentCard({
  sentiment,
  type,
}: {
  sentiment: (typeof sentimentBuckets)[SentimentKey][number]
  type: SentimentDescriptor
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/75 p-6 shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl dark:border-white/5 dark:bg-slate-900/70 ${
        type === "bullish"
          ? "before:absolute before:inset-0 before:bg-gradient-to-br before:from-emerald-500/10 before:via-transparent before:to-white/5"
          : "before:absolute before:inset-0 before:bg-gradient-to-br before:from-rose-500/10 before:via-transparent before:to-white/5"
      }`}
    >
      <div className="relative flex flex-col gap-6">
        <header className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/40 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
              <span>{type === "bullish" ? "Bullish" : "Bearish"}</span>
              <span className="inline-flex items-center gap-1 text-slate-900">
                {type === "bullish" ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                {Math.round(Math.abs(sentiment.score) * 100)}
              </span>
            </div>
            <h3 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">
              {sentiment.symbol}
              <span className="ml-3 text-base font-medium text-slate-500">{sentiment.company}</span>
            </h3>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-500">Last price</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">${sentiment.price.toFixed(2)}</p>
              <p
                className={`text-sm font-semibold ${
                  type === "bullish" ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {sentiment.change}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/40 bg-white/70 px-4 py-3 text-center shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confidence</span>
              <span className="text-2xl font-semibold text-slate-900">{Math.round(sentiment.confidence * 100)}%</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">multi-source</span>
            </div>
          </div>
        </header>

        <div className="grid gap-3 lg:grid-cols-2">
          {sentiment.catalysts.map((catalyst) => (
            <div
              key={catalyst}
              className={`flex items-start gap-3 rounded-2xl border border-transparent bg-gradient-to-r px-4 py-3 text-sm font-medium leading-snug text-slate-700 shadow-inner ${
                type === "bullish"
                  ? "from-emerald-100 via-white/60 to-transparent"
                  : "from-rose-100 via-white/60 to-transparent"
              }`}
            >
              {type === "bullish" ? (
                <Sparkles className="h-4 w-4 text-emerald-500" />
              ) : (
                <Zap className="h-4 w-4 text-rose-500" />
              )}
              {catalyst}
            </div>
          ))}
        </div>

        <ul className="space-y-3">
          {sentiment.rationale.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/60 bg-white/60 px-4 py-3 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300"
            >
              <ShieldCheck
                className={`mt-0.5 h-4 w-4 ${type === "bullish" ? "text-emerald-500" : "text-rose-500"}`}
              />
              <span>{reason}</span>
            </li>
          ))}
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
              Updated {formatDistanceToNow(new Date(sentiment.lastUpdated), { addSuffix: true })}
            </span>
          </div>
        </footer>
      </div>
    </article>
  )
}

export default function SentimentsPage() {
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
        <section className="relative overflow-hidden rounded-[3rem] border border-white/20 bg-white/70 p-10 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-300/20 via-transparent to-cyan-300/20" />
          <div className="relative grid gap-10 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/50 bg-emerald-100/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                <Sparkles className="h-4 w-4" />
                Sentiment intelligence
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Your market-pulse headquarters.
              </h1>
              <p className="max-w-2xl text-lg text-slate-600">
                Explore the strongest bullish and bearish narratives distilled from options flow, macro shifts, and real-time news tone. Every card blends conviction scoring with the context you need to trade with confidence.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <div className="flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-4 py-2 shadow-sm">
                  <Flame className="h-4 w-4 text-emerald-500" />
                  Updated continuously
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-4 py-2 shadow-sm">
                  <Zap className="h-4 w-4 text-cyan-500" />
                  Multi-source signal fusion
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-4 py-2 shadow-sm">
                  <ShieldCheck className="h-4 w-4 text-slate-900" />
                  Explainable rationale
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {heroStats.map((stat) => {
                const Icon = stat.icon
                return (
                  <div
                    key={stat.label}
                    className={`relative overflow-hidden rounded-3xl border border-white/30 bg-white/80 p-6 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 ${
                      gradientByTone[stat.tone]
                    }`}
                  >
                    <div className="relative flex flex-col gap-4">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-slate-900 shadow-lg">
                        <Icon className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">{stat.label}</p>
                      <p className="text-3xl font-semibold text-slate-900">{stat.value}</p>
                      <p className="text-sm text-slate-600">{stat.change}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2">
              {secondaryInsights.map((stat) => (
                <SentimentStat key={stat.label} stat={stat} />
              ))}
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {(Object.keys(sentimentBuckets) as SentimentKey[]).map((key) => (
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
                    {sentimentBuckets[key].map((sentiment) => (
                      <SentimentCard key={sentiment.symbol} sentiment={sentiment} type={key} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/70 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70">
              <div className="relative flex flex-col gap-6 p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/50 bg-cyan-100/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">
                  <Layers className="h-4 w-4" />
                  Signal tape
                </div>
                <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">
                  Live market read
                </h2>
                <p className="text-sm text-slate-500">
                  Cross-check macro, flow, and sentiment monitors in real time. Perfect for calibrating conviction before you act.
                </p>
                <div className="space-y-4">
                  {recentSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="rounded-2xl border border-white/50 bg-white/80 p-4 shadow-sm transition-transform duration-300 hover:-translate-y-1 dark:border-white/5 dark:bg-slate-900/70"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-600">{signal.label}</div>
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                            signal.direction === "bullish"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-600"
                          }`}
                        >
                          {signal.direction}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{signal.detail}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                        {formatDistanceToNow(new Date(signal.time), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[2.5rem] border border-white/20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white shadow-xl">
              <div className="flex flex-col gap-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]">
                  <Sparkles className="h-4 w-4" />
                  Upgrade your edge
                </div>
                <h3 className="text-3xl font-semibold">
                  Overlay the sentiment board with your watchlists.
                </h3>
                <p className="text-sm text-slate-200">
                  Save bullish and bearish cards directly into personalized trade decks. Alerts ping you when conviction or catalysts shift.
                </p>
                <button
                  type="button"
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] transition-all duration-300 hover:border-transparent"
                >
                  <span className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  Add to workspace
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
    </>
  )
}
