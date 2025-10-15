"""
Fetch recent politician trades and output as JSON.

Used by the Next.js API to get politician trading data.
"""

import sys
import os
import json

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.analysis.politician_trades import fetch_recent_trades, summarize_politician_activity


def main():
    """Fetch recent politician trades and output as JSON."""
    try:
        print("Fetching politician trades...", file=sys.stderr)

        # Fetch recent trades (last 30 days)
        trades = fetch_recent_trades(days_back=30)

        # Convert to JSON-serializable format
        trades_data = [trade.to_dict() for trade in trades]

        # Add summary
        summary = summarize_politician_activity(trades)

        result = {
            "success": True,
            "trades": trades_data,
            "summary": summary,
            "count": len(trades_data),
        }

        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "trades": [],
            "summary": {},
            "count": 0,
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
