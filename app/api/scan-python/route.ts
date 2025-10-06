import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    // Execute Python script to scan for opportunities
    const { spawn } = await import("child_process")

    return new Promise((resolve) => {
      const python = spawn("./venv/bin/python3", ["scripts/smart_options_scanner.py"])

      let dataString = ""
      let errorString = ""

      python.stdout.on("data", (data) => {
        dataString += data.toString()
      })

      python.stderr.on("data", (data) => {
        errorString += data.toString()
        // Also capture stderr in case JSON is output there
        dataString += data.toString()
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
          console.log("Total data length:", dataString.length)
          console.log("Data ends with:", dataString.slice(-100))
          
          // Simple approach: find the complete JSON array
          const startIndex = dataString.lastIndexOf('[')
          const endIndex = dataString.lastIndexOf(']')
          
          console.log("Start index:", startIndex, "End index:", endIndex)
          
          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const jsonString = dataString.substring(startIndex, endIndex + 1)
            console.log("JSON string length:", jsonString.length)
            console.log("JSON starts with:", jsonString.slice(0, 100))
            const opportunities = JSON.parse(jsonString)
            
            resolve(
              NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                opportunities,
                source: "yfinance",
              }),
            )
          } else {
            // Fallback: return empty array
            resolve(
              NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                opportunities: [],
                source: "yfinance",
              }),
            )
          }
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
