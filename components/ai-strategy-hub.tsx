"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Brain,
  CalendarDays,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Waves,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  AIStrategyHubData,
  BrokerId,
  BrokerNoteMap,
  BuildRequirement,
  MarketRegimeTone,
  RiskProfileKey,
} from "@/lib/ai-strategy-hub/types";

interface AIStrategyHubProps {
  userEmail?: string;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to load AI Strategy Hub data");
  }

  return (await response.json()) as AIStrategyHubData;
};

function formatConfidence(confidence: number) {
  return `${confidence}% AI conviction`;
}

function getBrokerNote(notes: BrokerNoteMap, broker: BrokerId) {
  return notes[broker] ?? notes.default;
}

const cardSurfaceClasses = "modern-card";

function getStatusBadgeStyles(status: BuildRequirement["status"]) {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "in-progress":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200";
    case "planned":
      return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-200";
  }
}

function formatStatusLabel(status: BuildRequirement["status"]) {
  return status
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toneToStatus(tone: MarketRegimeTone): BuildRequirement["status"] {
  if (tone === "calm") return "ready";
  if (tone === "volatile") return "planned";
  return "in-progress";
}

export function AIStrategyHub({ userEmail }: AIStrategyHubProps) {
  const [selectedRisk, setSelectedRisk] = useState<RiskProfileKey>("balanced");
  const [broker, setBroker] = useState<BrokerId>("robinhood");
  const { data, error, isLoading, mutate } = useSWR<AIStrategyHubData>(
    "/api/ai-strategy-hub",
    fetcher,
    {
      refreshInterval: 60_000,
    },
  );

  const riskProfiles = useMemo(
    () => data?.riskProfiles ?? [],
    [data?.riskProfiles],
  );
  const brokerOptions = useMemo(
    () => data?.brokerOptions ?? [],
    [data?.brokerOptions],
  );
  const strategyPlaybook = useMemo(
    () => data?.strategyPlaybook ?? [],
    [data?.strategyPlaybook],
  );

  useEffect(() => {
    if (
      riskProfiles.length &&
      !riskProfiles.some((profile) => profile.id === selectedRisk)
    ) {
      setSelectedRisk(riskProfiles[0].id);
    }
  }, [riskProfiles, selectedRisk]);

  useEffect(() => {
    if (
      brokerOptions.length &&
      !brokerOptions.some((option) => option.id === broker)
    ) {
      setBroker(brokerOptions[0].id);
    }
  }, [brokerOptions, broker]);

  const riskMeta = useMemo(
    () =>
      riskProfiles.find((profile) => profile.id === selectedRisk) ??
      riskProfiles[0] ??
      null,
    [riskProfiles, selectedRisk],
  );

  const filteredStrategies = useMemo(
    () =>
      strategyPlaybook.filter((strategy) =>
        strategy.suits.includes(selectedRisk),
      ),
    [strategyPlaybook, selectedRisk],
  );

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-sm">Loading Today&apos;s Plays…</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-40 rounded-xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <ShieldCheck className="h-5 w-5" />
              Something went sideways
            </CardTitle>
            <CardDescription>
              {error?.message ??
                "We could not load Today&apos;s Plays just yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => mutate()}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      <header className="space-y-4">
        <Badge className="premium-badge">
          <Sparkles className="h-3.5 w-3.5" /> Today&apos;s Plays
        </Badge>
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Retail trader playbooks tuned by AI — built for{" "}
            {brokerOptions.find((option) => option.id === broker)?.label ??
              "your broker"}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
            {userEmail ? `Welcome back, ${userEmail}. ` : ""}Pick the vibe that
            matches your account and let the AI Coach curate setups, guardrails,
            and build plans so you can trade like a WallStreetBets legend
            without blowing up.
          </p>
          <p className="text-xs text-muted-foreground">
            Data synced {new Date(data.generatedAt).toLocaleTimeString()} •
            refreshed automatically every minute
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 block">
              Risk Mode
            </span>
            <Select
              value={selectedRisk}
              onValueChange={(value) =>
                setSelectedRisk(value as RiskProfileKey)
              }
            >
              <SelectTrigger size="sm" className="min-w-[180px]">
                <SelectValue placeholder="Choose risk" />
              </SelectTrigger>
              <SelectContent>
                {riskProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <div className="flex flex-col text-left">
                      <span className="font-medium">{profile.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {profile.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 block">
              Broker Lens
            </span>
            <Select
              value={broker}
              onValueChange={(value) => setBroker(value as BrokerId)}
            >
              <SelectTrigger size="sm" className="min-w-[160px]">
                <SelectValue placeholder="Select broker" />
              </SelectTrigger>
              <SelectContent>
                {brokerOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {riskMeta && (
          <div className="rounded-xl border border-emerald-200/60 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-950/40 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-200">
              <Brain className="h-5 w-5" />
              <p className="text-sm font-semibold">
                Current risk vibe: {riskMeta.label}. {riskMeta.description}
              </p>
            </div>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-200/80">
              AI keeps you honest with real-time guardrails once brokerage sync
              is live. We&rsquo;re instrumenting automation so you can execute
              fast but still protect capital.
            </p>
          </div>
        )}
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Strategy Playbook
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Targeted trade structures mapped to your current risk mode.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStrategies.map((strategy) => (
            <Card key={strategy.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    {strategy.name}
                  </CardTitle>
                  <Badge variant="outline">
                    {formatConfidence(strategy.confidence)}
                  </Badge>
                </div>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-200/80">
                  {strategy.scenario}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600 dark:text-slate-200/90">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground dark:text-slate-300/90">
                  <span>Capital: {strategy.capitalRange}</span>
                  <span>Timeframe: {strategy.timeframe}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    AI assists
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {strategy.aiSupport.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Entry checklist
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {strategy.entryChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Exit plan
                  </h3>
                  <p>{strategy.exitPlan}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Broker tip
                  </h3>
                  <p>{getBrokerNote(strategy.brokerNotes, broker)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Waves className="h-5 w-5 text-sky-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Market Regime Radar
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Let AI interpret volatility, flow, and macro vibes so you know
              which playbooks to lean into.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.marketRegimes.map((regime) => (
            <Card key={regime.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader className="pb-4">
                <Badge
                  className={getStatusBadgeStyles(toneToStatus(regime.tone))}
                >
                  {regime.name}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-slate-600 dark:text-slate-200/90">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Signals
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-200 space-y-1">
                    {regime.indicators.map((indicator) => (
                      <li key={indicator}>{indicator}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Plays
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-200 space-y-1">
                    {regime.recommendedPlays.map((play) => (
                      <li key={play}>{play}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-200/80">
                  {regime.aiBrief}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-purple-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Earnings &amp; Event Companion
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Blend historical stats, sentiment, and AI debriefs to plan your
              next event-driven win.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.earningsCompanion.map((entry) => (
            <Card key={entry.ticker} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    {entry.ticker}
                  </CardTitle>
                  <Badge variant="outline">{entry.eventDate}</Badge>
                </div>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-200/80">
                  {entry.aiTakeaway}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-200/90">
                <p className="text-sm text-slate-600 dark:text-slate-200/80">
                  {entry.historicalStats}
                </p>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Suggested plays
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-200 space-y-1">
                    {entry.suggestedPlays.map((play) => (
                      <li key={play}>{play}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Prep checklist
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-200 space-y-1">
                    {entry.prepChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-rose-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Risk Diary Guardrails
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Guardrails keep your YOLO impulses in check without killing the
              vibe. AI nudges are timed to your trading sessions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.riskGuardrails.map((guardrail) => (
            <Card key={guardrail.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                  {guardrail.trigger}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-200/90">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Guardrail
                  </h3>
                  <p>{guardrail.guardrail}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    AI nudge
                  </h3>
                  <p>{guardrail.aiNudge}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Automation
                  </h3>
                  <p>{guardrail.automation}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Flow &amp; Sentiment Synthesizer
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No more doom-scrolling. AI triages the loudest signals and tells
              you why they matter.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.flowSignals.map((signal) => (
            <Card key={signal.symbol} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    {signal.symbol}
                  </CardTitle>
                  <Badge variant="secondary">Hot signal</Badge>
                </div>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-200/80">
                  {signal.headline}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-200/90">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Context
                  </h3>
                  <p>{signal.context}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Why it matters
                  </h3>
                  <p>{signal.whyItMatters}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Follow-up
                  </h3>
                  <p>{signal.followUp}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-5 w-5 text-indigo-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Education-in-the-Loop
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Bite-sized lessons triggered by what you&rsquo;re trading so you
              actually keep learning.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.educationMoments.map((moment) => (
            <Card key={moment.topic} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  {moment.topic}
                </CardTitle>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-200/80">
                  {moment.prompt}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-200/90">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    AI answer
                  </h3>
                  <p>{moment.aiResponse}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Challenge
                  </h3>
                  <p>{moment.challenge}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Waves className="h-5 w-5 text-cyan-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              What we still need to build
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              These are the high-leverage engineering + AI deliverables required
              to take the hub from concept to production.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.buildRequirements.map((requirement) => (
            <Card key={requirement.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    {requirement.title}
                  </CardTitle>
                  <Badge className={getStatusBadgeStyles(requirement.status)}>
                    {formatStatusLabel(requirement.status)}
                  </Badge>
                </div>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-200/80">
                  {requirement.summary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-200/90">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Owner
                  </h3>
                  <p className="capitalize">{requirement.owner}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Dependencies
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {requirement.dependencies.map((dependency) => (
                      <li key={dependency}>{dependency}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground dark:text-slate-300/90">
                  <span>Effort: {requirement.effort}</span>
                  <span>Success: {requirement.successMetric}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-emerald-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Implementation roadmap
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Phased rollout keeps us shipping value while derisking data +
              automation dependencies.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.implementationPhases.map((phase) => (
            <Card key={phase.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  {phase.title}
                </CardTitle>
                <CardDescription className="text-sm text-slate-600 dark:text-slate-200/80">
                  {phase.focus}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-200/90">
                <p className="text-xs uppercase tracking-wide text-muted-foreground dark:text-slate-300/80">
                  ETA: {phase.eta}
                </p>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Deliverables
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {phase.deliverables.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

export default AIStrategyHub;
