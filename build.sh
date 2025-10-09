#!/bin/bash
set -e

echo "Creating Python virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
. venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Installing Node.js dependencies..."
npm ci

echo "Building Next.js application..."
npm run build

echo "Build complete!"
