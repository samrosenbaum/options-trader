import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    // Execute Python script to scan for opportunities
    const { spawn } = await import("child_process")

    return new Promise((resolve) => {
      const python = spawn("./venv/bin/python3", ["scripts/fetch_options_data.py"])

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
            NextResponse.json(
              { success: false, error: "Failed to scan options", details: errorString },
              { status: 500 },
            ),
          )
          return
        }

        try {
          // Extract JSON from output (ignore print statements)
          const jsonMatch = dataString.match(/\[[\s\S]*\]/)
          const opportunities = jsonMatch ? JSON.parse(jsonMatch[0]) : []

          resolve(
            NextResponse.json({
              success: true,
              timestamp: new Date().toISOString(),
              opportunities,
              source: "yfinance",
            }),
          )
        } catch (error) {
          console.error("Error parsing Python output:", error)
          resolve(NextResponse.json({ success: false, error: "Failed to parse scan results" }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    console.error("Error executing Python script:", error)
    return NextResponse.json({ success: false, error: "Failed to execute scan" }, { status: 500 })
  }
}
