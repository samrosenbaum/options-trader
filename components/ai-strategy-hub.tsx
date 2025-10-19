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

const cardSurfaceClasses = "bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow";

function getStatusBadgeStyles(status: BuildRequirement["status"]) {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold";
    case "in-progress":
      return "bg-amber-100 text-amber-800 border-amber-300 font-semibold";
    case "planned":
      return "bg-sky-100 text-sky-800 border-sky-300 font-semibold";
    default:
      return "bg-slate-100 text-slate-800 border-slate-300 font-semibold";
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
        <div className="flex items-center gap-3 text-slate-600">
          <div className="h-4 w-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
          <p className="text-sm font-medium">Loading Today&apos;s Plays…</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-48 rounded-xl bg-slate-100 border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-700">
              <ShieldCheck className="h-5 w-5" />
              Something went sideways
            </CardTitle>
            <CardDescription className="text-slate-700">
              {error?.message ??
                "We could not load Today&apos;s Plays just yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => mutate()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-sm"
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
      <header className="space-y-6">
        <Badge className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" /> Today&apos;s Plays
        </Badge>
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold text-slate-900 leading-tight">
            Retail trader playbooks tuned by AI — built for{" "}
            {brokerOptions.find((option) => option.id === broker)?.label ??
              "your broker"}
          </h1>
          <p className="text-lg text-slate-700 max-w-3xl leading-relaxed">
            {userEmail ? `Welcome back, ${userEmail}. ` : ""}Pick the vibe that
            matches your account and let the AI Coach curate setups, guardrails,
            and build plans so you can trade like a WallStreetBets legend
            without blowing up.
          </p>
          <p className="text-xs text-slate-500">
            Data synced {new Date(data.generatedAt).toLocaleTimeString()} •
            refreshed automatically every minute
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700 block">
              Risk Mode
            </label>
            <Select
              value={selectedRisk}
              onValueChange={(value) =>
                setSelectedRisk(value as RiskProfileKey)
              }
            >
              <SelectTrigger className="w-full h-14 bg-white border-2 border-slate-200 hover:border-emerald-400 transition-colors">
                <SelectValue placeholder="Choose risk" />
              </SelectTrigger>
              <SelectContent>
                {riskProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <div className="flex flex-col text-left py-1">
                      <span className="font-semibold text-slate-900">{profile.label}</span>
                      <span className="text-xs text-slate-600">
                        {profile.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700 block">
              Broker Lens
            </label>
            <Select
              value={broker}
              onValueChange={(value) => setBroker(value as BrokerId)}
            >
              <SelectTrigger className="w-full h-14 bg-white border-2 border-slate-200 hover:border-emerald-400 transition-colors">
                <SelectValue placeholder="Select broker" />
              </SelectTrigger>
              <SelectContent>
                {brokerOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="font-semibold text-slate-900">{option.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {riskMeta && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Brain className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-bold text-emerald-900">
                  Current risk vibe: {riskMeta.label}. {riskMeta.description}
                </p>
                <p className="text-sm text-emerald-800 leading-relaxed">
                  AI keeps you honest with real-time guardrails once brokerage sync
                  is live. We&rsquo;re instrumenting automation so you can execute
                  fast but still protect capital.
                </p>
              </div>
            </div>
          </div>
        )}
      </header>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Strategy Playbook
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Targeted trade structures mapped to your current risk mode.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredStrategies.map((strategy) => (
            <Card key={strategy.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader className="space-y-3 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-slate-900">
                    {strategy.name}
                  </CardTitle>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold">
                    {formatConfidence(strategy.confidence)}
                  </Badge>
                </div>
                <CardDescription className="text-sm text-slate-700 leading-relaxed">
                  {strategy.scenario}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-700">
                <div className="flex flex-wrap gap-3 text-xs text-slate-600 font-medium">
                  <span>Capital: {strategy.capitalRange}</span>
                  <span>Timeframe: {strategy.timeframe}</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">
                    AI assists
                  </h3>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-700">
                    {strategy.aiSupport.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">
                    Entry checklist
                  </h3>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-700">
                    {strategy.entryChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">
                    Exit plan
                  </h3>
                  <p className="text-slate-700">{strategy.exitPlan}</p>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">
                    Broker tip
                  </h3>
                  <p className="text-slate-700">{getBrokerNote(strategy.brokerNotes, broker)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Waves className="h-6 w-6 text-sky-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Market Regime Radar
            </h2>
            <p className="text-sm text-slate-600 mt-1">
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
              <CardContent className="space-y-3 text-slate-700">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Signals
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                    {regime.indicators.map((indicator) => (
                      <li key={indicator}>{indicator}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Plays
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                    {regime.recommendedPlays.map((play) => (
                      <li key={play}>{play}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-slate-700">
                  {regime.aiBrief}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-purple-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Earnings &amp; Event Companion
            </h2>
            <p className="text-sm text-slate-600 mt-1">
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
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {entry.ticker}
                  </CardTitle>
                  <Badge variant="outline">{entry.eventDate}</Badge>
                </div>
                <CardDescription className="text-sm text-slate-700">
                  {entry.aiTakeaway}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <p className="text-sm text-slate-700">
                  {entry.historicalStats}
                </p>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Suggested plays
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                    {entry.suggestedPlays.map((play) => (
                      <li key={play}>{play}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Prep checklist
                  </h3>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
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

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-rose-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Risk Diary Guardrails
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Guardrails keep your YOLO impulses in check without killing the
              vibe. AI nudges are timed to your trading sessions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.riskGuardrails.map((guardrail) => (
            <Card key={guardrail.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">
                  {guardrail.trigger}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Guardrail
                  </h3>
                  <p>{guardrail.guardrail}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    AI nudge
                  </h3>
                  <p>{guardrail.aiNudge}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Automation
                  </h3>
                  <p>{guardrail.automation}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-amber-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Flow &amp; Sentiment Synthesizer
            </h2>
            <p className="text-sm text-slate-600 mt-1">
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
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {signal.symbol}
                  </CardTitle>
                  <Badge variant="secondary">Hot signal</Badge>
                </div>
                <CardDescription className="text-sm text-slate-700">
                  {signal.headline}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Context
                  </h3>
                  <p>{signal.context}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Why it matters
                  </h3>
                  <p>{signal.whyItMatters}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Follow-up
                  </h3>
                  <p>{signal.followUp}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-indigo-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Education-in-the-Loop
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Bite-sized lessons triggered by what you&rsquo;re trading so you
              actually keep learning.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.educationMoments.map((moment) => (
            <Card key={moment.topic} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  {moment.topic}
                </CardTitle>
                <CardDescription className="text-sm text-slate-700">
                  {moment.prompt}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    AI answer
                  </h3>
                  <p>{moment.aiResponse}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Challenge
                  </h3>
                  <p>{moment.challenge}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Waves className="h-6 w-6 text-cyan-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              What we still need to build
            </h2>
            <p className="text-sm text-slate-600 mt-1">
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
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {requirement.title}
                  </CardTitle>
                  <Badge className={getStatusBadgeStyles(requirement.status)}>
                    {formatStatusLabel(requirement.status)}
                  </Badge>
                </div>
                <CardDescription className="text-sm text-slate-700">
                  {requirement.summary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Owner
                  </h3>
                  <p className="capitalize">{requirement.owner}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Dependencies
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {requirement.dependencies.map((dependency) => (
                      <li key={dependency}>{dependency}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Effort: {requirement.effort}</span>
                  <span>Success: {requirement.successMetric}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Implementation roadmap
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Phased rollout keeps us shipping value while derisking data +
              automation dependencies.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.implementationPhases.map((phase) => (
            <Card key={phase.id} className={cn("h-full", cardSurfaceClasses)}>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  {phase.title}
                </CardTitle>
                <CardDescription className="text-sm text-slate-700">
                  {phase.focus}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <p className="text-xs uppercase tracking-wide text-slate-600">
                  ETA: {phase.eta}
                </p>
                <div>
                  <h3 className="font-semibold text-slate-900">
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
