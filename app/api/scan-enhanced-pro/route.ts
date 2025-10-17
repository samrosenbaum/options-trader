import { NextResponse } from "next/server"
import { spawn } from "child_process"
import { resolvePythonExecutable } from "@/lib/server/python"

/**
 * Enhanced Pro Scanner API
 *
 * Applies institutional-grade screening criteria:
 * - Stock-level filters (market cap, volume, price, EMA trend)
 * - Options-specific filters (bid-ask spread, IV rank, liquidity)
 * - Trade structure matching (directional vs income)
 * - Enhanced scoring system
 */

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes for enhanced scanning

interface EnhancedScanRequest {
  strategy?: "auto" | "directional" | "income"
  budget?: number
  symbols?: string[]
}

export async function POST(request: Request) {
  try {
    const body: EnhancedScanRequest = await request.json()
    const strategy = body.strategy || "auto"
    const budget = body.budget
    const symbols = body.symbols

    console.log("Starting enhanced pro scan...")
    console.log(`  Strategy: ${strategy}`)
    if (budget) console.log(`  Budget: $${budget}`)
    if (symbols) console.log(`  Symbols: ${symbols.join(", ")}`)

    const pythonExecutable = await resolvePythonExecutable()

    // Step 1: Run normal scanner first
    console.log("Step 1: Running base scanner...")
    const scannerArgs = ["scripts/smart_scanner.py"]
    if (budget) scannerArgs.push("--budget", budget.toString())
    if (symbols && symbols.length > 0) scannerArgs.push("--symbols", ...symbols)

    const baseScanResults = await new Promise<string>((resolve, reject) => {
      const scanner = spawn(pythonExecutable, scannerArgs, {
        env: { ...process.env, PYTHONPATH: process.cwd() },
      })

      let stdout = ""
      let stderr = ""

      scanner.stdout.on("data", (data) => {
        stdout += data.toString()
      })

      scanner.stderr.on("data", (data) => {
        stderr += data.toString()
        // Log progress
        const line = data.toString().trim()
        if (line) console.log(`  [Scanner] ${line}`)
      })

      scanner.on("close", (code) => {
        if (code !== 0) {
          console.error("Base scanner failed:", stderr)
          reject(new Error(`Scanner failed with code ${code}`))
          return
        }
        resolve(stdout)
      })

      scanner.on("error", (error) => {
        reject(error)
      })
    })

    // Parse base results
    let baseResults
    try {
      // Find JSON in output
      const lines = baseScanResults.split("\n")
      const jsonStart = lines.findIndex((line) => line.trim().startsWith("{"))
      if (jsonStart === -1) {
        throw new Error("No JSON found in scanner output")
      }
      const jsonOutput = lines.slice(jsonStart).join("\n")
      baseResults = JSON.parse(jsonOutput)
    } catch {
      console.error("Failed to parse base scanner results")
      throw new Error("Invalid scanner output")
    }

    console.log(`Step 1 complete: ${baseResults.opportunities?.length || 0} base opportunities found`)

    // Step 2: Apply enhanced filters
    console.log("Step 2: Applying enhanced filters...")
    const enhancedResults = await new Promise<{ opportunities: unknown[]; metadata: Record<string, unknown> }>((resolve, reject) => {
      const enhancer = spawn(pythonExecutable, ["scripts/enhanced_scanner_service.py"], {
        env: { ...process.env, PYTHONPATH: process.cwd() },
      })

      let stdout = ""
      let stderr = ""

      // Send base results to enhancer via stdin
      const input = JSON.stringify({
        opportunities: baseResults.opportunities || [],
        strategy: strategy,
      })
      enhancer.stdin.write(input)
      enhancer.stdin.end()

      enhancer.stdout.on("data", (data) => {
        stdout += data.toString()
      })

      enhancer.stderr.on("data", (data) => {
        stderr += data.toString()
        // Log progress
        const line = data.toString().trim()
        if (line) console.log(`  [Enhancer] ${line}`)
      })

      enhancer.on("close", (code) => {
        if (code !== 0) {
          console.error("Enhanced filter failed:", stderr)
          reject(new Error(`Enhancer failed with code ${code}`))
          return
        }

        try {
          // Find JSON in output
          const lines = stdout.split("\n")
          const jsonStart = lines.findIndex((line) => line.trim().startsWith("{"))
          if (jsonStart === -1) {
            throw new Error("No JSON found in enhancer output")
          }
          const jsonOutput = lines.slice(jsonStart).join("\n")
          resolve(JSON.parse(jsonOutput))
        } catch {
          console.error("Failed to parse enhancer results")
          reject(new Error("Invalid enhancer output"))
        }
      })

      enhancer.on("error", (error) => {
        reject(error)
      })
    })

    console.log(`Step 2 complete: ${enhancedResults.opportunities?.length || 0} enhanced opportunities`)
    console.log("✅ Enhanced pro scan complete")

    return NextResponse.json({
      success: true,
      opportunities: enhancedResults.opportunities || [],
      metadata: {
        ...enhancedResults.metadata,
        baseOpportunities: baseResults.opportunities?.length || 0,
        enhancedOpportunities: enhancedResults.opportunities?.length || 0,
        filterEfficiency: `${((enhancedResults.opportunities?.length || 0) / (baseResults.opportunities?.length || 1) * 100).toFixed(1)}%`,
        strategy: strategy,
      },
    })
  } catch (error) {
    console.error("Error in enhanced pro scan:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Enhanced scan failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
