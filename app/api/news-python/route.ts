import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET() {
  try {
    const { spawn } = await import("child_process")

    return new Promise((resolve) => {
      const python = spawn("./venv/bin/python3", ["scripts/fetch_market_news.py"])

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
          console.error("Python script error:", errorString)
          resolve(
            NextResponse.json({ success: false, error: "Failed to fetch news", details: errorString }, { status: 500 }),
          )
          return
        }

        try {
          const jsonMatch = dataString.match(/\[[\s\S]*\]/)
          const news = jsonMatch ? JSON.parse(jsonMatch[0]) : []

          resolve(
            NextResponse.json({
              success: true,
              news,
              source: "yfinance",
            }),
          )
        } catch (error) {
          console.error("Error parsing Python output:", error)
          resolve(NextResponse.json({ success: false, error: "Failed to parse news results" }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    console.error("Error executing Python script:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch news" }, { status: 500 })
  }
}
