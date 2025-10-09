import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbols = searchParams.get("symbols") || "AAPL,MSFT,GOOGL,AMZN,NVDA,TSLA,META,AMD,NFLX,SPY"

    // On Vercel, Python may not be available - use Yahoo Finance API directly
    if (process.env.VERCEL) {
      console.log("Running on Vercel - using direct Yahoo Finance API")
      const symbolList = symbols.split(",").map(s => s.trim())

      // Use Yahoo Finance API directly
      const quotes = await Promise.all(
        symbolList.map(async (symbol) => {
          try {
            const response = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0',
                },
              }
            )

            if (!response.ok) {
              console.error(`Failed to fetch ${symbol}: ${response.status}`)
              return null
            }

            const data = await response.json()
            const result = data?.chart?.result?.[0]

            if (!result) return null

            const meta = result.meta
            const quote = result.indicators?.quote?.[0]

            return {
              symbol: meta.symbol,
              price: meta.regularMarketPrice || quote?.close?.[quote.close.length - 1] || 0,
              change: meta.regularMarketPrice && meta.chartPreviousClose
                ? meta.regularMarketPrice - meta.chartPreviousClose
                : 0,
              changePercent: meta.regularMarketPrice && meta.chartPreviousClose
                ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
                : 0,
            }
          } catch (error) {
            console.error(`Error fetching ${symbol}:`, error)
            return null
          }
        })
      )

      const validQuotes = quotes.filter(q => q !== null)

      return NextResponse.json({
        success: true,
        quotes: validQuotes,
        source: "yahoo-direct",
      })
    }

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()
    const scriptPath = path.join(process.cwd(), "scripts", "get_stock_quotes.py")

    return await new Promise<NextResponse>((resolve) => {
      const python = spawn(pythonPath, [scriptPath, symbols])

      let dataString = ""
      let errorString = ""

      python.stdout.on("data", (data) => {
        dataString += data.toString()
      })

      python.stderr.on("data", (data) => {
        errorString += data.toString()
      })

      python.on("error", (error) => {
        console.error("Failed to start python process:", error)
        resolve(
          NextResponse.json(
            { success: false, error: "Failed to fetch quotes", details: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          ),
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", errorString)
          resolve(
            NextResponse.json(
              { success: false, error: "Failed to fetch quotes", details: errorString },
              { status: 500 },
            ),
          )
          return
        }

        try {
          const jsonMatch = dataString.match(/\[[\s\S]*\]/)
          const quotes = jsonMatch ? JSON.parse(jsonMatch[0]) : []

          resolve(
            NextResponse.json({
              success: true,
              quotes,
              source: "yfinance",
            }),
          )
        } catch (error) {
          console.error("Error parsing Python output:", error)
          resolve(NextResponse.json({ success: false, error: "Failed to parse quotes" }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    console.error("Error executing Python script:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch quotes" }, { status: 500 })
  }
}
