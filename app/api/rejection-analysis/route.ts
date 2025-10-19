import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface AnalysisParams {
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

interface NormalizedAnalysis {
  total_rejections: number
  analyzed_count: number
  profitable_count: number
  profitable_rate: number
  avg_change_percent: number
  missed_opportunities: unknown[]
  rejection_reason_stats: Record<string, {
    count: number
    profitable_count: number
    profitable_rate: number
    avg_change: number
  }>
  filter_stage_stats: Record<string, {
    count: number
    profitable_count: number
    profitable_rate: number
  }>
  recommendations: string[]
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
        const stageData = value as { count?: number; profitable_rate?: number; profitable_count?: number }
        const count = typeof stageData.count === "number" ? stageData.count : 0
        const rate = typeof stageData.profitable_rate === "number" ? stageData.profitable_rate : 0
        filterStageStats[stage] = {
          count,
          profitable_count: typeof stageData.profitable_count === "number"
            ? stageData.profitable_count
            : Math.round(count * rate),
          profitable_rate: rate,
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
    missed_opportunities: Array.isArray(raw?.missed_opportunities) ? raw!.missed_opportunities : [],
    rejection_reason_stats: rejectionReasonStats,
    filter_stage_stats: filterStageStats,
    recommendations: Array.isArray(raw?.recommendations) ? raw!.recommendations : [],
    raw: raw || {},
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: AnalysisParams = await request.json()
    const daysBack = body.daysBack || 7
    const minProfitPercent = body.minProfitPercent || 10

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
            NextResponse.json(
              { success: false, error: "Analysis failed", details: errorString },
              { status: 500 }
            )
          )
          return
        }

        try {
          // Extract JSON from output
          const jsonMatch = dataString.match(/\{[\s\S]*\}/)
          const rawAnalysis: RawAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
          const analysis = normalizeAnalysis(rawAnalysis)

          resolve(
            NextResponse.json({
              success: true,
              timestamp: new Date().toISOString(),
              analysis,
            })
          )
        } catch (error) {
          console.error("Error parsing analysis output:", error)
          resolve(
            NextResponse.json(
              { success: false, error: "Failed to parse results" },
              { status: 500 }
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error running rejection analysis:", error)
    return NextResponse.json(
      { success: false, error: "Failed to analyze rejections" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Get recent rejections (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data, error } = await supabase
      .from("rejected_options")
      .select("*")
      .gte("rejected_at", sevenDaysAgo.toISOString())
      .order("rejected_at", { ascending: false })
      .limit(500)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      rejections: data || [],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error("Error fetching rejections:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch rejections" },
      { status: 500 }
    )
  }
}
