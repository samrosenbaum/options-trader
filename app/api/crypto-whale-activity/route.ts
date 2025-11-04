import { NextResponse } from "next/server"
import { spawn } from "child_process"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  try {
    console.log("Starting crypto whale activity monitor...")

    const pythonExecutable = await resolvePythonExecutable()
    const pythonProcess = spawn(
      pythonExecutable,
      ["scripts/crypto_whale_monitor.py"],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    let output = ""
    let errorOutput = ""

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString()
    })

    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString()
    })

    return await new Promise<NextResponse>((resolve) => {
      pythonProcess.on("error", (processError) => {
        console.error("Failed to start whale monitor:", processError)
        resolve(
          NextResponse.json(
            {
              success: false,
              error: "Failed to start whale monitor",
              details:
                processError instanceof Error
                  ? processError.message
                  : String(processError),
            },
            { status: 500 },
          ),
        )
      })

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          try {
            // Parse the JSON output from the Python script
            const lines = output.trim().split("\n")
            let jsonStart = -1

            // Find where JSON output starts
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith("{")) {
                jsonStart = i
                break
              }
            }

            if (jsonStart >= 0) {
              const jsonOutput = lines.slice(jsonStart).join("\n")
              const whaleData = JSON.parse(jsonOutput)

              resolve(
                NextResponse.json({
                  success: true,
                  timestamp: new Date().toISOString(),
                  ...whaleData,
                }),
              )
            } else {
              resolve(
                NextResponse.json(
                  {
                    success: false,
                    error: "No valid JSON output from whale monitor",
                    output: output,
                    errorOutput: errorOutput,
                  },
                  { status: 500 },
                ),
              )
            }
          } catch (parseError) {
            console.error("Error parsing whale monitor output:", parseError)
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: "Failed to parse whale monitor results",
                  output: output,
                  errorOutput: errorOutput,
                },
                { status: 500 },
              ),
            )
          }
        } else {
          console.error("Whale monitor process failed:", errorOutput)
          resolve(
            NextResponse.json(
              {
                success: false,
                error: "Whale monitor failed",
                code: code,
                errorOutput: errorOutput,
                output: output,
              },
              { status: 500 },
            ),
          )
        }
      })
    })

  } catch (error) {
    console.error("Error running whale monitor:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
