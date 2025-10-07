import { access } from "fs/promises"
import { constants } from "fs"
import path from "path"

async function isExecutable(candidate: string | undefined | null) {
  if (!candidate) {
    return false
  }

  try {
    await access(candidate, constants.X_OK)
    return true
  } catch {
    try {
      await access(candidate, constants.F_OK)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Resolve the python executable to use for running helper scripts. We prefer a
 * project-local virtual environment but gracefully fall back to `python3` on
 * the PATH so development setups without a venv still function.
 */
export async function resolvePythonExecutable() {
  const cwd = process.cwd()
  const candidates = [
    process.env.PYTHON_EXECUTABLE,
    path.join(cwd, "venv", "bin", "python3"),
    path.join(cwd, "venv", "Scripts", "python.exe"),
  ]

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate as string
    }
  }

  return process.platform === "win32" ? "python" : "python3"
}
