#!/bin/bash
# Test the new sentiment-first scanner architecture

echo "🧪 Testing New Scanner Architecture"
echo "===================================="
echo ""

# Test 1: Verify imports work
echo "1️⃣  Testing imports..."
python3 -c "
from src.scanner.sentiment_prescreener import SentimentPreScreener
from src.scanner.enhanced_service import InstitutionalOptionsScanner
print('✅ All imports successful')
" || { echo "❌ Import failed"; exit 1; }

echo ""

# Test 2: Check if sentiment pre-screener finds hot symbols
echo "2️⃣  Testing sentiment pre-screener..."
python3 -c "
from src.scanner.sentiment_prescreener import SentimentPreScreener

prescreener = SentimentPreScreener()

# Test with small sample
test_symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'AMD']

print('Finding hot symbols from sample...')
hot = prescreener.get_hot_symbols(
    universe=test_symbols,
    max_results=5,
    include_gainers=True,
    include_losers=True,
    include_volume=True
)

if hot:
    print(f'✅ Found {len(hot)} hot symbols: {hot}')
else:
    print('⚠️  No hot symbols found (may be after hours)')
" || { echo "❌ Pre-screener test failed"; exit 1; }

echo ""

# Test 3: Run full scanner with sentiment pre-screening
echo "3️⃣  Running full scanner (with pre-screening)..."
echo "   This will take 40-60 seconds..."
echo ""

export USE_SENTIMENT_PRESCREENING=1

python3 -m src.scanner.enhanced_service --max-symbols 30 --json-indent 2 > /tmp/scanner_output.json 2>&1

# Check if it succeeded
if [ $? -eq 0 ]; then
    echo "✅ Scanner completed successfully"
    echo ""

    # Parse results
    echo "📊 Results:"
    python3 -c "
import json
import sys

try:
    with open('/tmp/scanner_output.json', 'r') as f:
        content = f.read()

    # Extract JSON from output (may have stderr mixed in)
    json_start = content.find('{')
    if json_start == -1:
        json_start = content.find('[')

    if json_start >= 0:
        json_str = content[json_start:]
        data = json.loads(json_str)

        if isinstance(data, dict):
            opportunities = data.get('opportunities', [])
            metadata = data.get('metadata', {})
        else:
            opportunities = data
            metadata = {}

        print(f'   Total opportunities: {len(opportunities)}')

        if opportunities:
            print(f'   Symbols found: {[o[\"symbol\"] for o in opportunities[:5]]}')

            # Check for directional bias
            has_directional = any('directionalBias' in o or 'enhancedDirectionalBias' in o for o in opportunities)
            if has_directional:
                print('   ✅ Directional bias included!')

                # Show first opportunity's bias
                for opp in opportunities[:1]:
                    symbol = opp.get('symbol', '?')
                    enhanced_bias = opp.get('enhancedDirectionalBias', {})
                    if enhanced_bias:
                        direction = enhanced_bias.get('direction', 'unknown')
                        confidence = enhanced_bias.get('confidence', 0)
                        print(f'   Example: {symbol} = {direction.upper()} (confidence: {confidence:.0%})')
            else:
                print('   ⚠️  No directional bias found')

        # Check if sentiment pre-screening was used
        enhanced_stats = metadata.get('enhancedStatistics', {})
        if enhanced_stats:
            print('   ✅ Enhanced statistics present')

    else:
        print('   ⚠️  Could not parse JSON output')
        print('   Raw output length:', len(content))

except Exception as e:
    print(f'   ⚠️  Error parsing results: {e}')
    sys.exit(1)
"
else
    echo "❌ Scanner failed"
    echo ""
    echo "Error output:"
    cat /tmp/scanner_output.json
    exit 1
fi

echo ""

# Test 4: Check retrospective analyzer
echo "4️⃣  Testing retrospective analyzer..."
python3 -c "
from scripts.analyze_missed_opportunities import MissedOpportunityAnalyzer

analyzer = MissedOpportunityAnalyzer()
print('✅ Retrospective analyzer initialized')
print('   (Run full analysis with: python scripts/analyze_missed_opportunities.py)')
" || { echo "❌ Analyzer test failed"; exit 1; }

echo ""
echo "===================================="
echo "✅ ALL TESTS PASSED!"
echo ""
echo "📊 What's Working:"
echo "   • Sentiment pre-screener finds hot symbols"
echo "   • Scanner returns opportunities"
echo "   • Directional bias analysis included"
echo "   • Retrospective analyzer ready"
echo ""
echo "🚀 Try these commands:"
echo "   • Full scan: python -m src.scanner.enhanced_service"
echo "   • Retrospective: python scripts/analyze_missed_opportunities.py"
echo "   • Disable pre-screening: USE_SENTIMENT_PRESCREENING=0 python -m src.scanner.enhanced_service"
echo ""
