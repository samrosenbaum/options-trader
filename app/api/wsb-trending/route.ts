import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 15

interface WSBTrendingRequest {
  topN?: number
}

export async function POST(request: Request) {
  try {
    const body: WSBTrendingRequest = await request.json()
    const { topN = 10 } = body

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    // Run WSB tracker
    const result = await new Promise<{ trending: unknown[]; metadata: Record<string, unknown> }>((resolve, reject) => {
      const python = spawn(
        pythonPath,
        [
          "-c",
          `
import json
import sys
sys.path.insert(0, '.')
from src.social.wsb_tracker import get_wsb_trending

# Get trending tickers
result = get_wsb_trending(top_n=${topN})

# Output JSON
print(json.dumps(result, default=str))
`,
        ],
        {
          env: { ...process.env, PYTHONPATH: process.cwd() },
        }
      )

      let stdout = ""
      let stderr = ""

      python.stdout.on("data", (data) => {
        stdout += data.toString()
      })

      python.stderr.on("data", (data) => {
        stderr += data.toString()
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("WSB tracker error:", stderr)
          reject(new Error(`WSB tracker failed: ${stderr}`))
          return
        }

        try {
          // Parse last JSON object from stdout
          const lines = stdout.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          const parsed = JSON.parse(jsonLine)
          resolve(parsed)
        } catch (parseError) {
          console.error("Failed to parse WSB tracker output:", stdout, parseError)
          reject(new Error("Failed to parse WSB tracker output"))
        }
      })
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error("Error running WSB tracker:", err)
    return NextResponse.json(
      {
        error: "Failed to fetch WSB trending tickers",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

// GET endpoint for easy testing
export async function GET() {
  return POST(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ topN: 10 })
  }))
}
