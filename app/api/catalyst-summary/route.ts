import { NextRequest, NextResponse } from "next/server"

import { resolvePythonExecutable } from "@/lib/server/python"
import { determineScannerExecutionPolicy } from "@/lib/server/scanner-runtime"

const TIMEOUT_MS = 45_000

const normalizeSymbols = (input: string): string[] => {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbolParam = searchParams.get("symbols") ?? searchParams.get("symbol")

  if (!symbolParam) {
    return NextResponse.json({ error: "Missing symbol parameter" }, { status: 400 })
  }

  const symbols = normalizeSymbols(symbolParam)
  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols provided" }, { status: 400 })
  }

  const policy = determineScannerExecutionPolicy()
  if (policy?.forceFallback) {
    return NextResponse.json(
      {
        error: "Catalyst service unavailable",
        reason: policy.reason,
        details: policy.details,
      },
      { status: 503 },
    )
  }

  const pythonPath = await resolvePythonExecutable()
  const { spawn } = await import("child_process")

  return await new Promise<NextResponse>((resolve) => {
    const child = spawn(pythonPath, ["-m", "scripts.catalyst_summary", "--symbols", symbols.join(",")], {
      env: { ...process.env, PYTHONPATH: process.cwd() },
    })

    let stdout = ""
    let stderr = ""
    let settled = false

    const settle = (response: NextResponse) => {
      if (!settled) {
        settled = true
        clearTimeout(timeoutId)
        resolve(response)
      }
    }

    const timeoutId = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch (error) {
        console.error("Failed to terminate catalyst summary process", error)
      }
      settle(
        NextResponse.json(
          {
            error: "Catalyst summary timeout",
            details: `Process exceeded ${TIMEOUT_MS / 1000} seconds`,
            stderr,
          },
          { status: 504 },
        ),
      )
    }, TIMEOUT_MS)

    child.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    child.on("error", (error) => {
      settle(
        NextResponse.json(
          {
            error: "Failed to launch catalyst summary",
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 500 },
        ),
      )
    })

    child.on("close", (code) => {
      if (code !== 0) {
        settle(
          NextResponse.json(
            {
              error: "Catalyst summary failed",
              details: stderr || `Python exited with code ${code}`,
            },
            { status: 500 },
          ),
        )
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        settle(NextResponse.json(parsed))
      } catch (error) {
        settle(
          NextResponse.json(
            {
              error: "Unable to parse catalyst summary output",
              details: error instanceof Error ? error.message : String(error),
              stderr,
            },
            { status: 500 },
          ),
        )
      }
    })
  })
}
