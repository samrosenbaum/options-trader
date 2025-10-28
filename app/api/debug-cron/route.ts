import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET

  return NextResponse.json({
    receivedHeader: authHeader,
    receivedHeaderLength: authHeader?.length || 0,
    expectedSecret: expectedSecret ? `${expectedSecret.substring(0, 10)}...` : 'NOT_SET',
    expectedSecretLength: expectedSecret?.length || 0,
    match: authHeader === `Bearer ${expectedSecret}`,
    secretIsSet: !!expectedSecret,
  })
}
