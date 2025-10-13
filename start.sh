#!/bin/bash
set -e

echo "Starting application..."

. scripts/ensure_node.sh

# Activate virtual environment
source venv/bin/activate

# Export Python executable path for Next.js API routes
export PYTHON_EXECUTABLE="$(pwd)/venv/bin/python3"
echo "Python executable set to: $PYTHON_EXECUTABLE"

# Start Next.js with node_modules/.bin/next directly
exec ./node_modules/.bin/next start -p ${PORT:-3000}
