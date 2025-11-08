#!/bin/bash
# Test the fundamentals scanner

echo "📊 Testing Fundamentals Scanner"
echo "===================================="
echo ""

# Test 1: Verify imports work
echo "1️⃣  Testing imports..."
python3 -c "
from src.signals.fundamentals_scanner import FundamentalsScanner
from src.signals.fundamental_health import FundamentalHealthCalculator
print('✅ All imports successful')
" || { echo "❌ Import failed"; exit 1; }

echo ""

# Test 2: Test fundamental health calculator
echo "2️⃣  Testing fundamental health calculator..."
python3 -c "
from src.signals.fundamental_health import FundamentalHealthCalculator
import yfinance as yf

calc = FundamentalHealthCalculator()

# Test with a well-known stock
ticker = yf.Ticker('AAPL')
info = ticker.info

result = calc.calculate(info)
print(f'✅ Health score for AAPL: {result[\"health_score\"]:.2f}')
print(f'   Risk level: {result[\"risk_level\"]}')
print(f'   Data completeness: {result[\"data_completeness\"]:.2f}')
" || { echo "❌ Health calculator test failed"; exit 1; }

echo ""

# Test 3: Test fundamentals scanner
echo "3️⃣  Testing fundamentals scanner..."
python3 -c "
from src.signals.fundamentals_scanner import FundamentalsScanner
import yfinance as yf

scanner = FundamentalsScanner()

# Test with a well-known stock
symbol = 'MSFT'
ticker = yf.Ticker(symbol)
info = ticker.info

signal = scanner.analyze_stock(symbol, info)

if signal:
    print(f'✅ Signal generated for {symbol}')
    print(f'   Overall score: {signal.overall_score}/100')
    print(f'   Quality level: {signal.quality_level}')
    print(f'   Buy reason: {signal.buy_reason}')
    print(f'   Strengths: {len(signal.strengths)}')
    print(f'   Weaknesses: {len(signal.weaknesses)}')
    print(f'   Risk level: {signal.risk_level}')
else:
    print('⚠️  No signal generated (insufficient data)')
" || { echo "❌ Scanner test failed"; exit 1; }

echo ""

# Test 4: Run scanner on small sample
echo "4️⃣  Running scanner on sample stocks..."
echo "   This will take 20-30 seconds..."
echo ""

python3 -m src.scanner.fundamentals_runner --symbols AAPL MSFT GOOGL NVDA TSLA

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Scanner completed successfully"
else
    echo ""
    echo "❌ Scanner failed"
    exit 1
fi

echo ""
echo "===================================="
echo "✅ ALL TESTS PASSED!"
echo ""
echo "📊 What's Working:"
echo "   • Fundamental health calculator"
echo "   • Multi-factor analysis engine"
echo "   • Signal generation with quality levels"
echo "   • Database storage ready"
echo ""
echo "🚀 Try these commands:"
echo "   • Quick scan: python -m src.scanner.fundamentals_runner --symbols AAPL MSFT"
echo "   • Sample scan: python -m src.scanner.fundamentals_runner"
echo "   • Full scan: python -m src.scanner.fundamentals_runner --all"
echo "   • Custom threshold: python -m src.scanner.fundamentals_runner --all --min-score 70"
echo ""
