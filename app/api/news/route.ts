import { NextResponse } from "next/server"
import { getMarketNews } from "@/lib/api/market-data"

export const runtime = "edge"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") || "general"

    const news = await getMarketNews(category)

    return NextResponse.json({
      success: true,
      news,
    })
  } catch (error) {
    console.error("Error fetching news:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch news" }, { status: 500 })
  }
}
