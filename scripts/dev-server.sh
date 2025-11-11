#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
VENV_DIR="$REPO_ROOT/venv"
PYTHON="python3"

. "$SCRIPT_DIR/ensure_node.sh"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python virtual environment at $VENV_DIR"
  $PYTHON -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

PYTHON_BIN="$VENV_DIR/bin/python"

STAMP_FILE="$VENV_DIR/.requirements-hash"
REQ_HASH=$("$PYTHON_BIN" - "$REPO_ROOT/requirements.txt" <<'PY'
import hashlib, pathlib, sys
path = pathlib.Path(sys.argv[1])
print(hashlib.sha256(path.read_bytes()).hexdigest())
PY
)

if [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE")" != "$REQ_HASH" ]; then
  echo "Installing Python dependencies..."
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r "$REPO_ROOT/requirements.txt"
  echo "$REQ_HASH" > "$STAMP_FILE"
fi

export PYTHON_EXECUTABLE="$VENV_DIR/bin/python3"
export NODE_ENV=${NODE_ENV:-development}

cleanup() {
  if [ -n "${UVICORN_PID:-}" ] && kill -0 "$UVICORN_PID" 2>/dev/null; then
    echo "Stopping FastAPI dev server (PID: $UVICORN_PID)"
    kill "$UVICORN_PID"
    wait "$UVICORN_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if command -v lsof >/dev/null 2>&1; then
  for port in 8000 3000; do
    if PIDS=$(lsof -ti :"$port"); then
      if [ -n "$PIDS" ]; then
        echo "Killing process on port $port ($PIDS)"
        kill -9 $PIDS || true
      fi
    fi
  done
fi

echo "Starting FastAPI dev server on http://localhost:8000"
uvicorn src.api.main:app --reload --port 8000 &
UVICORN_PID=$!

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "Installing Node dependencies..."
  (cd "$REPO_ROOT" && npm install)
fi

echo "Starting Next.js dev server on http://localhost:3000"
(cd "$REPO_ROOT" && npm run dev)
