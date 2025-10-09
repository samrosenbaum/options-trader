#!/bin/bash
set -e

echo "Starting application..."

# Activate virtual environment
source venv/bin/activate

# Start Next.js with node_modules/.bin/next directly
exec ./node_modules/.bin/next start -p ${PORT:-3000}
