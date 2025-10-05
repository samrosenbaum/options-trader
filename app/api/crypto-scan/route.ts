import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function GET(request: NextRequest) {
  try {
    console.log('Starting crypto scan...')
    
    const pythonProcess = spawn('./venv/bin/python3', [
      'scripts/crypto_scanner.py'
    ], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString()
    })

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse the JSON output from the Python script
            const lines = output.trim().split('\n')
            let jsonStart = -1
            
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith('{')) {
                jsonStart = i
                break
              }
            }
            
            if (jsonStart >= 0) {
              const jsonOutput = lines.slice(jsonStart).join('\n')
              const cryptoData = JSON.parse(jsonOutput)
              
              resolve(NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                ...cryptoData
              }))
            } else {
              resolve(NextResponse.json({
                success: false,
                error: 'No valid JSON output from crypto scanner',
                output: output,
                errorOutput: errorOutput
              }, { status: 500 }))
            }
          } catch (parseError) {
            console.error('Error parsing crypto scan output:', parseError)
            resolve(NextResponse.json({
              success: false,
              error: 'Failed to parse crypto scan results',
              output: output,
              errorOutput: errorOutput
            }, { status: 500 }))
          }
        } else {
          console.error('Crypto scanner process failed:', errorOutput)
          resolve(NextResponse.json({
            success: false,
            error: 'Crypto scanner failed',
            code: code,
            errorOutput: errorOutput,
            output: output
          }, { status: 500 }))
        }
      })
    })

  } catch (error) {
    console.error('Error running crypto scanner:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
