import { NextResponse } from 'next/server'

const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Supabase-Access-Token',
  'X-Requested-With',
]

function applyCorsHeaders(
  request: Request,
  response: NextResponse,
  methods: readonly string[],
) {
  const origin = request.headers.get('origin')
  const allowMethods = ['OPTIONS', ...methods]

  response.headers.set('Vary', 'Origin')
  response.headers.set('Access-Control-Allow-Methods', allowMethods.join(', '))

  const requestHeaders = request.headers.get('access-control-request-headers')
  response.headers.set(
    'Access-Control-Allow-Headers',
    requestHeaders ?? DEFAULT_ALLOWED_HEADERS.join(', '),
  )

  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  } else {
    response.headers.set('Access-Control-Allow-Origin', '*')
  }

  return response
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init: ResponseInit | undefined,
  methods: readonly string[],
) {
  const response = NextResponse.json(body, init)
  return applyCorsHeaders(request, response, methods)
}

export function handleOptions(
  request: Request,
  methods: readonly string[],
) {
  const response = new NextResponse(null, {
    status: 204,
  })
  response.headers.set('Access-Control-Max-Age', '86400')
  return applyCorsHeaders(request, response, methods)
}
