#!/bin/bash

# Kill any existing Next.js dev servers on port 3000
echo "🔍 Checking for existing dev servers..."
PID=$(lsof -ti:3000)

if [ ! -z "$PID" ]; then
  echo "🛑 Killing existing dev server (PID: $PID)"
  kill -9 $PID
  sleep 1
fi

# Clean .next folder for fresh build
echo "🧹 Cleaning .next folder..."
rm -rf .next

# Start dev server
echo "🚀 Starting dev server..."
npm run dev
