import { NextResponse } from 'next/server'
import { resolvePythonExecutable } from '@/lib/server/python'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    console.log('Fetching macro indicators...')

    const { spawn } = await import('child_process')
    const pythonPath = await resolvePythonExecutable()

    const macroData = await new Promise<any>((resolve, reject) => {
      const python = spawn(
        pythonPath,
        ['-m', 'scripts.fetch_macro_indicators'],
        {
          env: { ...process.env, PYTHONPATH: process.cwd() },
          cwd: process.cwd(),
        }
      )

      let stdoutBuffer = ''
      let stderrBuffer = ''

      python.stdout.on('data', (data) => {
        stdoutBuffer += data.toString()
      })

      python.stderr.on('data', (data) => {
        stderrBuffer += data.toString()
      })

      python.on('error', (error) => {
        console.error('Failed to start Python process:', error)
        reject(error)
      })

      python.on('close', (code) => {
        if (stderrBuffer) {
          console.log('Python script output:', stderrBuffer)
        }

        if (code !== 0) {
          console.error('Python script error (exit code):', code)
          reject(new Error(`Python script exited with code ${code}`))
          return
        }

        try {
          const data = JSON.parse(stdoutBuffer)
          console.log('Successfully fetched macro indicators')
          resolve(data)
        } catch (error) {
          console.error('Failed to parse Python output:', error)
          console.error('Raw stdout:', stdoutBuffer)
          reject(error)
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: macroData,
    })
  } catch (error) {
    console.error('Error fetching macro indicators:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch macro indicators',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
