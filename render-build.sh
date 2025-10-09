#!/bin/bash
set -e

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Installing Node.js dependencies..."
npm ci

echo "==> Building Next.js application..."
npm run build

echo "==> Build complete!"
