import { NextResponse } from "next/server"
import { fetchSentimentInsights } from "@/lib/sentiments/intelligence"

export const dynamic = "force-dynamic"
export const revalidate = 300 // Cache for 5 minutes

export async function GET() {
  try {
    const insights = await fetchSentimentInsights()

    return NextResponse.json({
      success: true,
      signals: insights.recentSignals,
    })
  } catch (error) {
    console.error("Error fetching sentiment signals:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch sentiment signals" },
      { status: 500 }
    )
  }
}
