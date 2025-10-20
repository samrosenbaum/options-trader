'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { Card } from './ui/card'

type FilterMode = 'strict' | 'relaxed'

interface RealTimeProgressProps {
  isScanning: boolean
  scanType: 'options' | 'crypto'
  filterMode?: FilterMode
  estimatedUniverse?: number | null
  lastTotalEvaluated?: number | null
  lastCompletedAt?: Date | null
}

interface PipelinePhase {
  key: string
  label: string
  detail: string
  duration: number
}

const GRID_OVERLAY_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(45,212,191,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.08) 1px, transparent 1px)',
  backgroundSize: '64px 64px',
}

const AURORA_STYLE: CSSProperties = {
  background:
    'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.35), transparent 55%), radial-gradient(circle at 80% 10%, rgba(59,130,246,0.25), transparent 45%), radial-gradient(circle at 50% 80%, rgba(14,165,233,0.18), transparent 60%)',
}

const formatElapsed = (ms: number) => {
  if (!ms || ms < 0) {
    return '00:00'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(seconds).padStart(2, '0')

  return `${paddedMinutes}:${paddedSeconds}`
}

const describeFilterMode = (mode?: FilterMode) => {
  if (mode === 'relaxed') {
    return 'Relaxed • Opportunistic'
  }
  if (mode === 'strict') {
    return 'Strict • Institutional'
  }
  return 'Adaptive'
}

export default function RealTimeProgress({
  isScanning,
  scanType,
  filterMode,
  estimatedUniverse,
  lastTotalEvaluated,
  lastCompletedAt,
}: RealTimeProgressProps) {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [phaseProgress, setPhaseProgress] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  const phaseRef = useRef(0)
  const cancelledRef = useRef(false)

  const pipelinePhases = useMemo<PipelinePhase[]>(() => {
    if (scanType === 'crypto') {
      return [
        {
          key: 'market-sync',
          label: 'Market sync',
          detail: 'Streaming on-chain + order book liquidity',
          duration: 2400,
        },
        {
          key: 'regime-detect',
          label: 'Volatility regime',
          detail: 'Detecting momentum + volatility clusters',
          duration: 2600,
        },
        {
          key: 'risk-intel',
          label: 'Risk intelligence',
          detail: 'Stress testing tail risk and funding rates',
          duration: 2400,
        },
        {
          key: 'signal-stack',
          label: 'Signal stack',
          detail: 'Reconciling quant + macro signals',
          duration: 2500,
        },
        {
          key: 'ranking',
          label: 'Ranking engine',
          detail: 'Prioritising asymmetric crypto trades',
          duration: 2300,
        },
      ]
    }

    return [
      {
        key: 'market-sync',
        label: 'Market sync',
        detail: 'Refreshing NBBO, volatility surfaces + greeks',
        duration: 2400,
      },
      {
        key: 'universe',
        label: 'Universe modelling',
        detail: 'Optimising liquidity + regime-aware symbol mix',
        duration: 2600,
      },
      {
        key: 'data-quality',
        label: 'Data integrity',
        detail: 'Cross-checking fundamentals and quote quality',
        duration: 2200,
      },
      {
        key: 'probabilities',
        label: 'Probability engine',
        detail: 'Running Monte Carlo paths + risk curves',
        duration: 2800,
      },
      {
        key: 'ranking',
        label: 'Ranking engine',
        detail: 'Scoring risk/reward + compliance rules',
        duration: 2400,
      },
    ]
  }, [scanType])

  useEffect(() => {
    if (!isScanning) {
      cancelledRef.current = true
      phaseRef.current = 0
      setPhaseIndex(0)
      setPhaseProgress(0)
      setElapsedMs(0)
      return
    }

    cancelledRef.current = false
    phaseRef.current = 0
    setPhaseIndex(0)
    setPhaseProgress(0)

    let animationFrame: number
    let phaseStart = performance.now()

    const animate = (timestamp: number) => {
      if (cancelledRef.current) {
        return
      }

      const activePhase = pipelinePhases[phaseRef.current]
      const duration = activePhase?.duration ?? 2400
      const elapsed = timestamp - phaseStart
      const progress = Math.min((elapsed / duration) * 100, 100)

      setPhaseProgress(progress)

      if (progress >= 100) {
        phaseRef.current = (phaseRef.current + 1) % pipelinePhases.length
        setPhaseIndex(phaseRef.current)
        setPhaseProgress(0)
        phaseStart = timestamp
      }

      animationFrame = requestAnimationFrame(animate)
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelledRef.current = true
      cancelAnimationFrame(animationFrame)
    }
  }, [isScanning, pipelinePhases])

  useEffect(() => {
    if (!isScanning) {
      setElapsedMs(0)
      return
    }

    const start = Date.now()
    setElapsedMs(0)

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - start)
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [isScanning])

  if (!isScanning) {
    return null
  }

  const activePhase = pipelinePhases[phaseIndex] ?? pipelinePhases[0]
  const formattedElapsed = formatElapsed(elapsedMs)
  const universeLabel = (() => {
    if (typeof estimatedUniverse === 'number' && Number.isFinite(estimatedUniverse) && estimatedUniverse > 0) {
      return `${estimatedUniverse.toLocaleString()} symbols`
    }
    return 'Live selection'
  })()
  const evaluatedLabel = (() => {
    if (typeof lastTotalEvaluated === 'number' && Number.isFinite(lastTotalEvaluated) && lastTotalEvaluated > 0) {
      return `${lastTotalEvaluated.toLocaleString()} contracts`
    }
    return 'Pending'
  })()
  const telemetryItems = [
    { label: 'Mode', value: describeFilterMode(filterMode) },
    { label: 'Universe', value: universeLabel },
    { label: 'Last contracts', value: evaluatedLabel },
    {
      label: 'Last completion',
      value: lastCompletedAt ? lastCompletedAt.toLocaleTimeString() : 'Pending first run',
    },
    { label: 'Elapsed', value: formattedElapsed },
  ]

  return (
    <Card className="relative mb-8 overflow-hidden border border-emerald-500/25 bg-slate-950/90 p-6 text-emerald-50 shadow-[0_40px_120px_rgba(16,185,129,0.25)]">
      <div className="pointer-events-none absolute inset-0" style={AURORA_STYLE} aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-35" style={GRID_OVERLAY_STYLE} aria-hidden />
      <div className="pointer-events-none absolute -inset-20 rounded-[36px] opacity-40 blur-3xl" style={AURORA_STYLE} aria-hidden />

      <div className="relative z-10 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300/80">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-300" />
              </span>
              Live {scanType === 'options' ? 'Options' : 'Crypto'} Scan
            </div>
            <div className="text-2xl font-semibold text-emerald-50">
              {activePhase?.label ?? 'Processing'}
            </div>
            <p className="text-sm text-emerald-100/70">{activePhase?.detail}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">Elapsed</div>
            <div className="font-mono text-2xl font-semibold text-emerald-100">{formattedElapsed}</div>
          </div>
        </div>

        <div className="relative h-24 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                'radial-gradient(circle at 20% 120%, rgba(16,185,129,0.25), transparent 65%), radial-gradient(circle at 80% -20%, rgba(56,189,248,0.25), transparent 60%)',
            }}
            aria-hidden
          />
          <div className="relative flex h-full items-end gap-1">
            {Array.from({ length: 18 }).map((_, index) => (
              <div key={`bar-${index}`} className="flex-1 h-full overflow-hidden rounded-full bg-emerald-400/10">
                <div
                  className="h-full w-full rounded-full bg-gradient-to-t from-emerald-500 via-emerald-300 to-cyan-300"
                  style={{
                    transformOrigin: 'bottom',
                    animation: `scanner-bar 1.8s ease-in-out ${index * 0.12}s infinite`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Institutional pipeline</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pipelinePhases.map((phase, index) => {
              const status = index < phaseIndex ? 'complete' : index === phaseIndex ? 'active' : 'upcoming'

              return (
                <div
                  key={phase.key}
                  className={`relative overflow-hidden rounded-2xl border bg-slate-950/70 p-4 transition-colors ${
                    status === 'active'
                      ? 'border-emerald-400/60 shadow-[0_0_35px_rgba(16,185,129,0.35)]'
                      : status === 'complete'
                        ? 'border-emerald-400/20 text-emerald-100/70'
                        : 'border-emerald-400/15 text-emerald-100/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em]">
                    <span>{phase.label}</span>
                    <span>
                      {status === 'complete' && '✓'}
                      {status === 'active' && '⟳'}
                      {status === 'upcoming' && '…'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-snug text-emerald-100/80">{phase.detail}</p>
                  {status === 'active' && (
                    <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-emerald-400/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-emerald-200 transition-all duration-150"
                        style={{ width: `${Math.min(Math.max(phaseProgress, 8), 100)}%` }}
                      />
                      <div
                        className="absolute inset-0 opacity-50"
                        style={{
                          background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.65), transparent)',
                          animation: 'scanner-glow 1.6s linear infinite',
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-emerald-400/20 bg-slate-950/70 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {telemetryItems.map(item => (
            <div key={item.label} className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-200/70">{item.label}</div>
              <div className="font-mono text-sm text-emerald-100">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
