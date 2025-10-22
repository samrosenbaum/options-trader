import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 30

interface HotScanRequest {
  symbols?: string[]
  maxResults?: number
}

export async function POST(request: Request) {
  try {
    const body: HotScanRequest = await request.json()
    const { symbols, maxResults = 20 } = body

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    // Run hot scanner
    const result = await new Promise<{ opportunities: unknown[]; metadata: Record<string, unknown> }>((resolve, reject) => {
      const python = spawn(
        pythonPath,
        [
          "-c",
          `
import json
import sys
sys.path.insert(0, '.')
from src.scanner.hot_scanner import run_hot_scan

# Parse input
symbols = ${symbols ? JSON.stringify(symbols) : 'None'}
max_results = ${maxResults}

# Run hot scan
result = run_hot_scan(symbols=symbols, max_results=max_results)

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
          console.error("Hot scanner error:", stderr)
          reject(new Error(`Hot scanner failed: ${stderr}`))
          return
        }

        try {
          // Parse last JSON object from stdout
          const lines = stdout.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          const parsed = JSON.parse(jsonLine)
          resolve(parsed)
        } catch (parseError) {
          console.error("Failed to parse hot scanner output:", stdout, parseError)
          reject(new Error("Failed to parse hot scanner output"))
        }
      })
    })

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("Error running hot scanner:", err)
    return NextResponse.json(
      {
        error: "Failed to run hot scanner",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
