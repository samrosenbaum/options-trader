const truthyValues = new Set(["1", "true", "yes", "on"]) as Set<string>

const falsy = (value: string | undefined): boolean => {
  if (!value) {
    return true
  }
  return value.trim().length === 0
}

const isTruthy = (value: string | undefined): boolean => {
  if (!value) {
    return false
  }
  return truthyValues.has(value.trim().toLowerCase())
}

export interface ScannerExecutionPolicy {
  forceFallback: boolean
  reason: string
  details?: string
}

const providerDetectors: Array<() => ScannerExecutionPolicy | null> = [
  () => {
    if (isTruthy(process.env.DISABLE_PYTHON_SCANNER)) {
      return {
        forceFallback: true,
        reason: "config_disabled",
        details: "Python scanner disabled via DISABLE_PYTHON_SCANNER environment variable",
      }
    }
    return null
  },
  () => {
    if (process.env.NEXT_RUNTIME === "edge") {
      return {
        forceFallback: true,
        reason: "edge_runtime",
        details: "Edge runtime detected; Python subprocesses are unavailable",
      }
    }
    return null
  },
  () => {
    if (isTruthy(process.env.VERCEL) || process.env.VERCEL === "1") {
      return {
        forceFallback: true,
        reason: "vercel_serverless",
        details: "Serverless deployment detected (Vercel) - falling back to bundled dataset",
      }
    }
    return null
  },
  () => {
    if (!falsy(process.env.RAILWAY_STATIC_URL)) {
      return {
        forceFallback: true,
        reason: "railway_static",
        details: "Railway static deployment detected; Python runtime cannot be spawned",
      }
    }
    return null
  },
  () => {
    // Render supports Python - do not force fallback
    // Python will be available as 'python3' by default on Render
    // We trust that if user deployed to Render with Python code, Python is available
    // Commenting out this check to allow Render to work without PYTHON_EXECUTABLE env var
    /*
    if (process.env.RENDER === "true") {
      if (falsy(process.env.PYTHON_EXECUTABLE)) {
        return {
          forceFallback: true,
          reason: "render_serverless",
          details: "Render environment without configured Python executable detected",
        }
      }
    }
    */
    return null
  },
  () => {
    if (process.env.AWS_REGION && process.env.LAMBDA_TASK_ROOT) {
      return {
        forceFallback: true,
        reason: "aws_lambda",
        details: "AWS Lambda environment detected; Python subprocesses are not supported",
      }
    }
    return null
  },
]

export const determineScannerExecutionPolicy = (): ScannerExecutionPolicy | null => {
  for (const detector of providerDetectors) {
    const policy = detector()
    if (policy?.forceFallback) {
      return policy
    }
  }

  return null
}
