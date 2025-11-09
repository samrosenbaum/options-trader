#!/bin/bash

# Run Fundamentals Scanner
# This script populates the fundamentals_signals table with stock analysis data

set -e

echo "================================================"
echo "📊 Stock Fundamentals Scanner"
echo "================================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    exit 1
fi

# Check if required Python packages are installed
echo "🔍 Checking Python dependencies..."
python3 -c "import yfinance, supabase" 2>/dev/null || {
    echo "❌ Missing required Python packages"
    echo "📦 Installing dependencies..."
    pip install yfinance supabase
}

# Check for environment variables
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "⚠️  Warning: Supabase credentials not found in environment"
    echo "   Loading from .env.local..."

    if [ -f ".env.local" ]; then
        export $(cat .env.local | grep -v '^#' | xargs)
    else
        echo "❌ Error: .env.local file not found"
        exit 1
    fi
fi

# Run the scanner
echo ""
echo "🚀 Running fundamentals scanner..."
echo ""

# Default to scanning 20 stocks (quick test)
# Use --all flag to scan full universe
if [ "$1" == "--all" ]; then
    echo "📈 Scanning full stock universe (this may take a while)..."
    python3 src/scanner/fundamentals_runner.py --all
elif [ "$1" == "--quick" ]; then
    echo "⚡ Quick scan (top 10 stocks)..."
    python3 src/scanner/fundamentals_runner.py --symbols AAPL MSFT GOOGL AMZN META NVDA TSLA JPM UNH WMT
else
    echo "📊 Default scan (20 stocks)..."
    python3 src/scanner/fundamentals_runner.py
fi

echo ""
echo "================================================"
echo "✅ Scan complete! Data is now available in the UI"
echo "================================================"
echo ""
echo "💡 Next steps:"
echo "   1. Visit /scanner/stock-fundamentals to view results"
echo "   2. Toggle between Chat and Card views"
echo "   3. Re-run this script daily to refresh data"
echo ""
