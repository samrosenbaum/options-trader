#!/bin/bash

# Kill any existing dev servers on ports 3000 and 8000
echo "🔍 Checking for existing dev servers..."
if command -v lsof >/dev/null 2>&1; then
  for port in 3000 8000; do
    if PIDS=$(lsof -ti:"$port"); then
      if [ -n "$PIDS" ]; then
        echo "🛑 Killing process on port $port ($PIDS)"
        kill -9 $PIDS || true
        sleep 1
      fi
    fi
  done
else
  echo "⚠️  lsof not found; skipping automatic port cleanup."
fi

# Clean .next folder for fresh build
echo "🧹 Cleaning .next folder..."
rm -rf .next

# Start dev server
echo "🚀 Starting dev server..."
npm run dev:full
