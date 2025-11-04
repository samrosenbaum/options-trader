import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { handleOptions, jsonWithCors } from "@/lib/server/cors"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_METHODS = ['GET', 'POST'] as const

export async function OPTIONS(request: Request) {
  return handleOptions(request, ALLOWED_METHODS)
}

interface LogRejectionParams {
  action: 'log'
  symbol: string
  strike: number
  expiration: string
  optionType: string
  stockPrice: number
  premium: number
  volume: number
  openInterest: number
  impliedVolatility?: number
  delta?: number
  rejectionReason: string
  filterStage: string
  rejectionSource: 'user_rejected' | 'scanner_rejected'
  userNotes?: string | null
  scores?: {
    probability_score?: number | null
    risk_adjusted_score?: number | null
    quality_score?: number | null
  }
}

interface AnalysisParams {
  action?: 'analyze'
  daysBack?: number
  minProfitPercent?: number
}

interface RawAnalysis {
  total_rejections?: number
  analyzed_count?: number
  profitable_rejection_rate?: number
  profitable_rate?: number
  avg_price_change?: number
  avg_change_percent?: number
  profitable_count?: number
  missed_opportunities?: unknown[]
  rejection_reason_analysis?: Array<{
    reason?: string
    count?: number
    profitable_rate?: number
    avg_change?: number
  }>
  filter_stage_analysis?: Record<string, unknown>
  recommendations?: string[]
  [key: string]: unknown
}

interface MissedOpportunityOption {
  symbol: string
  strike: number
  expiration?: string
  option_type: string
  rejection_reason: string
  filter_stage: string
  price_change_percent?: number | null
  probability_score?: number | null
  risk_adjusted_score?: number | null
  quality_score?: number | null
}

interface MissedOpportunityRecord {
  option: MissedOpportunityOption
  profit_percent?: number | null
  what_we_missed?: string
  pattern_tags?: string[]
}

interface StageStats {
  count: number
  profitable_count: number
  profitable_rate: number
  avg_change?: number
}

interface NormalizedAnalysis {
  total_rejections: number
  analyzed_count: number
  profitable_count: number
  profitable_rate: number
  avg_change_percent: number
  missed_opportunities: MissedOpportunityRecord[]
  rejection_reason_stats: Record<string, {
    count: number
    profitable_count: number
    profitable_rate: number
    avg_change: number
  }>
  filter_stage_stats: Record<string, StageStats>
  recommendations: string[]
  ai_summary: string | null
  raw: RawAnalysis
}

function normalizeAnalysis(raw: RawAnalysis | null | undefined): NormalizedAnalysis {
  const totalRejections = typeof raw?.total_rejections === "number"
    ? raw.total_rejections
    : typeof raw?.analyzed_count === "number"
      ? raw.analyzed_count
      : 0

  const profitableRate = typeof raw?.profitable_rejection_rate === "number"
    ? raw.profitable_rejection_rate
    : typeof raw?.profitable_rate === "number"
      ? raw.profitable_rate
      : 0

  const profitableCount = typeof raw?.profitable_count === "number"
    ? raw.profitable_count
    : Math.round(totalRejections * profitableRate)

  const avgChangePercent = typeof raw?.avg_price_change === "number"
    ? raw.avg_price_change
    : typeof raw?.avg_change_percent === "number"
      ? raw.avg_change_percent
      : 0

  const rejectionReasonStats: NormalizedAnalysis["rejection_reason_stats"] = {}

  if (Array.isArray(raw?.rejection_reason_analysis)) {
    for (const reasonStat of raw!.rejection_reason_analysis) {
      const reasonKey = reasonStat.reason || "Unknown"
      const count = typeof reasonStat.count === "number" ? reasonStat.count : 0
      const reasonRate = typeof reasonStat.profitable_rate === "number" ? reasonStat.profitable_rate : 0
      rejectionReasonStats[reasonKey] = {
        count,
        profitable_count: Math.round(count * reasonRate),
        profitable_rate: reasonRate,
        avg_change: typeof reasonStat.avg_change === "number" ? reasonStat.avg_change : 0,
      }
    }
  }

  const filterStageStats: NormalizedAnalysis["filter_stage_stats"] = {}
  if (raw && typeof raw.filter_stage_analysis === "object" && raw.filter_stage_analysis !== null) {
    for (const [stage, value] of Object.entries(raw.filter_stage_analysis)) {
      if (value && typeof value === "object") {
        const stageData = value as { count?: number; profitable_rate?: number; profitable_count?: number; avg_change?: number }
        const count = typeof stageData.count === "number" ? stageData.count : 0
        const rate = typeof stageData.profitable_rate === "number" ? stageData.profitable_rate : 0
        filterStageStats[stage] = {
          count,
          profitable_count: typeof stageData.profitable_count === "number"
            ? stageData.profitable_count
            : Math.round(count * rate),
          profitable_rate: rate,
          avg_change: typeof stageData.avg_change === "number" ? stageData.avg_change : undefined,
        }
      }
    }
  }

  return {
    total_rejections: totalRejections,
    analyzed_count: totalRejections,
    profitable_count: profitableCount,
    profitable_rate: profitableRate,
    avg_change_percent: avgChangePercent,
    missed_opportunities: Array.isArray(raw?.missed_opportunities) ? raw!.missed_opportunities as MissedOpportunityRecord[] : [],
    rejection_reason_stats: rejectionReasonStats,
    filter_stage_stats: filterStageStats,
    recommendations: Array.isArray(raw?.recommendations) ? raw!.recommendations : [],
    ai_summary: null,
    raw: raw || {},
  }
}

function extractMissedOpportunities(records: MissedOpportunityRecord[] | undefined | null): MissedOpportunityRecord[] {
  if (!Array.isArray(records)) {
    return []
  }

  return records.filter((record): record is MissedOpportunityRecord => {
    if (!record || typeof record !== "object") {
      return false
    }
    const option = (record as MissedOpportunityRecord).option
    return !!option && typeof option.symbol === "string" && typeof option.option_type === "string"
  })
}

function formatFallbackSummary(analysis: NormalizedAnalysis, winners: MissedOpportunityRecord[]): string {
  const total = analysis.total_rejections
  const profitableCount = analysis.profitable_count
  const winRate = total > 0 ? (profitableCount / total) * 100 : 0
  const avgWinner = winners.reduce((sum, winner) => {
    const value = typeof winner.profit_percent === "number"
      ? winner.profit_percent
      : typeof winner.option.price_change_percent === "number"
        ? winner.option.price_change_percent
        : 0
    return sum + value
  }, 0) / (winners.length || 1)

  const topReasons = Object.entries(analysis.rejection_reason_stats)
    .sort(([, a], [, b]) => b.profitable_rate - a.profitable_rate)
    .slice(0, 2)
    .map(([reason, stats]) => `${reason} (${(stats.profitable_rate * 100).toFixed(0)}% hit rate)`)

  const highlights = winners
    .slice(0, 3)
    .map((winner) => {
      const change = typeof winner.profit_percent === "number"
        ? winner.profit_percent
        : typeof winner.option.price_change_percent === "number"
          ? winner.option.price_change_percent
          : 0
      const formattedChange = change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`
      return `${winner.option.symbol} ${winner.option.option_type.toUpperCase()} ${formattedChange}`
    })

  const reasonLine = topReasons.length > 0
    ? `Most frequent reversal reasons: ${topReasons.join("; ")}.`
    : ""

  const highlightLine = highlights.length > 0
    ? `Standouts: ${highlights.join(", ")}.`
    : ""

  return [
    `${profitableCount} of ${total} filtered contracts (${winRate.toFixed(1)}%) would have made money.`,
    `Average gain among winners: ${avgWinner.toFixed(1)}%.`,
    reasonLine,
    highlightLine,
  ].filter(Boolean).join(" ")
}

async function generateAISummary(analysis: NormalizedAnalysis): Promise<string | null> {
  const winners = extractMissedOpportunities(analysis.missed_opportunities)

  if (winners.length === 0) {
    return "No rejected contracts crossed the profitability threshold in this window — the filters kept the losers out."
  }

  const payload = {
    totalRejections: analysis.total_rejections,
    profitableRejections: analysis.profitable_count,
    overallHitRate: analysis.profitable_rate,
    averageChange: analysis.avg_change_percent,
    topReasons: Object.entries(analysis.rejection_reason_stats)
      .sort(([, a], [, b]) => b.profitable_rate - a.profitable_rate)
      .slice(0, 5)
      .map(([reason, stats]) => ({
        reason,
        hitRate: stats.profitable_rate,
        avgChange: stats.avg_change,
        sampleSize: stats.count,
      })),
    winners: winners.slice(0, 5).map((winner) => ({
      symbol: winner.option.symbol,
      type: winner.option.option_type,
      strike: winner.option.strike,
      expiration: winner.option.expiration,
      rejectionReason: winner.option.rejection_reason,
      filterStage: winner.option.filter_stage,
      profitPercent: typeof winner.profit_percent === "number"
        ? winner.profit_percent
        : winner.option.price_change_percent,
      notes: winner.what_we_missed,
      tags: winner.pattern_tags,
    })),
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return formatFallbackSummary(analysis, winners)
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      temperature: 0.2,
      system: "You are an elite quant analyst specializing in post-trade reviews. Summarize findings crisply, highlighting what the risk filters missed and what adjustments might help.",
      messages: [
        {
          role: "user",
          content: `Provide a concise narrative (2-3 sentences) about the rejected options that later became profitable. Base it on this JSON data: ${JSON.stringify(payload)}`,
        },
      ],
    })

    const text = response.content
      .map((block) => block.type === "text" ? block.text : "")
      .join("")
      .trim()

    if (text) {
      return text
    }
  } catch (error) {
    console.error("Failed to generate AI summary:", error)
  }

  return formatFallbackSummary(analysis, winners)
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: LogRejectionParams | AnalysisParams = await request.json()

    // Handle rejection logging
    if ('action' in body && body.action === 'log') {
      const logParams = body as LogRejectionParams

      try {
        const supabase = await createClient()

        // Get the authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
          return jsonWithCors(
            request,
            { success: false, error: 'Unauthorized - must be logged in to reject options' },
            { status: 401 },
            ALLOWED_METHODS,
          )
        }

        const record = {
          user_id: user.id,
          symbol: logParams.symbol,
          strike: logParams.strike,
          expiration: logParams.expiration,
          option_type: logParams.optionType,
          rejection_reason: logParams.rejectionReason,
          filter_stage: logParams.filterStage,
          rejection_source: logParams.rejectionSource,
          rejected_at: new Date().toISOString(),
          stock_price: logParams.stockPrice,
          option_price: logParams.premium,
          volume: logParams.volume,
          open_interest: logParams.openInterest,
          implied_volatility: logParams.impliedVolatility ?? null,
          delta: logParams.delta ?? null,
          user_notes: logParams.userNotes ?? null,
          probability_score: logParams.scores?.probability_score ?? null,
          risk_adjusted_score: logParams.scores?.risk_adjusted_score ?? null,
          quality_score: logParams.scores?.quality_score ?? null,
        }

        const { error } = await supabase
          .from('rejected_options')
          .insert(record)

        if (error) {
          console.error('Failed to log rejection:', error)
          return jsonWithCors(
            request,
            { success: false, error: 'Failed to log rejection', details: error.message },
            { status: 500 },
            ALLOWED_METHODS,
          )
        }

        return jsonWithCors(request, { success: true }, undefined, ALLOWED_METHODS)
      } catch (error) {
        console.error('Error logging rejection:', error)
        return jsonWithCors(
          request,
          { success: false, error: 'Failed to log rejection' },
          { status: 500 },
          ALLOWED_METHODS,
        )
      }
    }

    // Handle rejection analysis
    const analysisParams = body as AnalysisParams
    // Reduced from 7 to 3 days to prevent Supabase timeout
    const daysBack = analysisParams.daysBack || 3
    const minProfitPercent = analysisParams.minProfitPercent || 10

    // Execute Python script to analyze rejections
    const { spawn } = await import("child_process")

    const args = [
      "scripts/analyze_rejections.py",
      "--days-back",
      String(daysBack),
      "--min-profit",
      String(minProfitPercent)
    ]

    return new Promise((resolve) => {
      const python = spawn("python3", args)

      let dataString = ""
      let errorString = ""

      python.stdout.on("data", (data) => {
        dataString += data.toString()
      })

      python.stderr.on("data", (data) => {
        errorString += data.toString()
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Rejection analysis error:", errorString)
          resolve(
            jsonWithCors(
              request,
              { success: false, error: "Analysis failed", details: errorString },
              { status: 500 },
              ALLOWED_METHODS,
            )
          )
          return
        }

        try {
          // Extract JSON from output
          const jsonMatch = dataString.match(/\{[\s\S]*\}/)
          const rawAnalysis: RawAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
          const analysis = normalizeAnalysis(rawAnalysis)

          ;(async () => {
            try {
              analysis.ai_summary = await generateAISummary(analysis)
            } catch (summaryError) {
              console.error("Unexpected AI summary failure:", summaryError)
              const winners = extractMissedOpportunities(analysis.missed_opportunities)
              analysis.ai_summary = winners.length
                ? formatFallbackSummary(analysis, winners)
                : "No rejected contracts crossed the profitability threshold in this window — the filters kept the losers out."
            }

            resolve(
              jsonWithCors(
                request,
                {
                  success: true,
                  timestamp: new Date().toISOString(),
                  analysis,
                },
                undefined,
                ALLOWED_METHODS,
              )
            )
          })()
        } catch (error) {
          console.error("Error parsing analysis output:", error)
          resolve(
            jsonWithCors(
              request,
              { success: false, error: "Failed to parse results" },
              { status: 500 },
              ALLOWED_METHODS,
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error running rejection analysis:", error)
    return jsonWithCors(
      request,
      { success: false, error: "Failed to analyze rejections" },
      { status: 500 },
      ALLOWED_METHODS,
    )
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Get query parameters
    const source = searchParams.get('source') || 'user_rejected' // Default to user rejections only
    const daysBack = parseInt(searchParams.get('days') || '7', 10)

    // Calculate date range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    // Build query
    let query = supabase
      .from("rejected_options")
      .select("*")
      .gte("rejected_at", startDate.toISOString())
      .order("rejected_at", { ascending: false })
      .limit(500)

    // Filter by rejection source
    if (source === 'user') {
      // Fetch both user_rejected and user_closed_position (but NOT scanner_rejected)
      query = query.in('rejection_source', ['user_rejected', 'user_closed_position'])
    } else if (source !== 'all') {
      query = query.eq('rejection_source', source)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return jsonWithCors(
      request,
      {
        success: true,
        rejections: data || [],
        count: data?.length || 0,
        source,
      },
      undefined,
      ALLOWED_METHODS,
    )
  } catch (error) {
    console.error("Error fetching rejections:", error)
    return jsonWithCors(
      request,
      { success: false, error: "Failed to fetch rejections" },
      { status: 500 },
      ALLOWED_METHODS,
    )
  }
}
