import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface AnalysisParams {
  daysBack?: number
  minProfitPercent?: number
}

export async function POST(request: Request) {
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
          const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

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
