#!/bin/bash
set -e

echo "Starting application..."

. scripts/ensure_node.sh

# Activate virtual environment
source venv/bin/activate

# Export Python executable path for Next.js API routes
export PYTHON_EXECUTABLE="$(pwd)/venv/bin/python3"
echo "Python executable set to: $PYTHON_EXECUTABLE"

# Copy static files and public folder to standalone build
if [ -d ".next/standalone" ]; then
  echo "Using standalone build..."
  cp -r .next/static .next/standalone/.next/
  cp -r public .next/standalone/
  cd .next/standalone
  exec node server.js
else
  echo "Using regular next start..."
  exec ./node_modules/.bin/next start -p ${PORT:-3000}
fi
