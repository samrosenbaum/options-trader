"""
WallStreetBets Trending Ticker Tracker

Scrapes r/wallstreetbets to find trending tickers and sentiment.
No API key needed - uses Reddit's public JSON endpoints.
"""

import re
import requests
from typing import Dict, List, Any
from collections import Counter
from datetime import datetime


class WSBTracker:
    """Track trending tickers from WallStreetBets."""

    def __init__(self):
        self.wsb_url = "https://www.reddit.com/r/wallstreetbets"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (compatible; OptionsScanner/1.0)"
        }

        # Common ticker patterns
        self.ticker_pattern = re.compile(r'\b[A-Z]{1,5}\b')

        # Bullish emojis
        self.bullish_indicators = ['🚀', '🌙', '💎', '🙌', 'moon', 'calls', 'bullish']

        # Bearish emojis
        self.bearish_indicators = ['📉', '💩', 'puts', 'bearish', 'crash', 'dump']

        # Ignore common non-ticker words
        self.ignore_words = {
            'WSB', 'YOLO', 'DD', 'FD', 'CEO', 'USA', 'SEC', 'FDA', 'IPO',
            'ETF', 'NYSE', 'PDF', 'CEO', 'CFO', 'IMO', 'EDIT', 'TLDR',
            'ELI5', 'AMA', 'TIL', 'PSA', 'LPT', 'TL', 'DR', 'THE', 'AND',
            'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS',
            'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW',
            'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO', 'BOY', 'DID',
            'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'DAD', 'MOM'
        }

    def get_hot_posts(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Fetch hot posts from r/wallstreetbets.

        Args:
            limit: Number of posts to fetch (max 100)

        Returns:
            List of post data dicts
        """
        try:
            response = requests.get(
                f"{self.wsb_url}/hot.json?limit={limit}",
                headers=self.headers,
                timeout=10
            )

            # Log response details for debugging
            print(f"[WSB] Status code: {response.status_code}")
            if response.status_code != 200:
                print(f"[WSB] Response body: {response.text[:500]}")

            response.raise_for_status()

            data = response.json()
            posts = data.get('data', {}).get('children', [])

            print(f"[WSB] Successfully fetched {len(posts)} posts")
            return [post['data'] for post in posts]

        except requests.exceptions.HTTPError as e:
            print(f"[WSB] HTTP Error fetching posts: {e}")
            print(f"[WSB] Status: {e.response.status_code if hasattr(e, 'response') else 'N/A'}")
            return []
        except requests.exceptions.Timeout:
            print("[WSB] Request timed out after 10 seconds")
            return []
        except Exception as e:
            print(f"[WSB] Unexpected error fetching posts: {type(e).__name__}: {e}")
            return []

    def extract_tickers(self, text: str) -> List[str]:
        """
        Extract potential ticker symbols from text.

        Args:
            text: Post title or comment text

        Returns:
            List of ticker symbols
        """
        # Find all capitalized words
        matches = self.ticker_pattern.findall(text)

        # Filter out common words and very short/long tickers
        # Exclude single-letter tickers (A, I, etc.) - they're rarely actual tickers
        tickers = [
            m for m in matches
            if m not in self.ignore_words and 2 <= len(m) <= 5
        ]

        return tickers

    def calculate_sentiment(self, text: str) -> str:
        """
        Calculate sentiment from text based on emojis and keywords.

        Args:
            text: Post title or body

        Returns:
            "bullish", "bearish", or "neutral"
        """
        text_lower = text.lower()

        bullish_count = sum(1 for indicator in self.bullish_indicators if indicator in text_lower)
        bearish_count = sum(1 for indicator in self.bearish_indicators if indicator in text_lower)

        if bullish_count > bearish_count:
            return "bullish"
        elif bearish_count > bullish_count:
            return "bearish"
        else:
            return "neutral"

    def get_trending_tickers(self, top_n: int = 10) -> List[Dict[str, Any]]:
        """
        Get top trending tickers from WSB with mention counts and sentiment.

        Args:
            top_n: Number of top tickers to return

        Returns:
            List of dicts with ticker, mentions, sentiment, sample_posts
        """
        posts = self.get_hot_posts(limit=100)

        if not posts:
            return []

        # Track ticker mentions and sentiment
        ticker_mentions: Counter = Counter()
        ticker_sentiment: Dict[str, List[str]] = {}
        ticker_posts: Dict[str, List[Dict[str, str]]] = {}

        for post in posts:
            title = post.get('title', '')
            selftext = post.get('selftext', '')
            full_text = f"{title} {selftext}"

            # Extract tickers
            tickers = self.extract_tickers(full_text)

            # Calculate sentiment
            sentiment = self.calculate_sentiment(full_text)

            for ticker in tickers:
                ticker_mentions[ticker] += 1

                # Track sentiment
                if ticker not in ticker_sentiment:
                    ticker_sentiment[ticker] = []
                ticker_sentiment[ticker].append(sentiment)

                # Store sample post
                if ticker not in ticker_posts:
                    ticker_posts[ticker] = []

                if len(ticker_posts[ticker]) < 3:  # Keep top 3 posts per ticker
                    ticker_posts[ticker].append({
                        'title': title,
                        'url': f"https://www.reddit.com{post.get('permalink', '')}",
                        'upvotes': post.get('ups', 0),
                        'sentiment': sentiment
                    })

        # Build trending tickers list
        trending = []
        for ticker, count in ticker_mentions.most_common(top_n):
            sentiments = ticker_sentiment[ticker]

            # Calculate overall sentiment
            bullish_pct = (sentiments.count('bullish') / len(sentiments)) * 100
            bearish_pct = (sentiments.count('bearish') / len(sentiments)) * 100

            if bullish_pct > 60:
                overall_sentiment = "bullish"
                emoji = "🚀"
            elif bearish_pct > 60:
                overall_sentiment = "bearish"
                emoji = "📉"
            else:
                overall_sentiment = "neutral"
                emoji = "➡️"

            trending.append({
                'ticker': ticker,
                'mentions': count,
                'sentiment': overall_sentiment,
                'emoji': emoji,
                'bullish_pct': round(bullish_pct, 1),
                'bearish_pct': round(bearish_pct, 1),
                'sample_posts': ticker_posts.get(ticker, [])[:3],
                'timestamp': datetime.now().isoformat()
            })

        return trending


def get_wsb_trending(top_n: int = 10) -> Dict[str, Any]:
    """
    Get trending tickers from WallStreetBets.

    Args:
        top_n: Number of top tickers to return

    Returns:
        Dict with trending tickers and metadata
    """
    tracker = WSBTracker()
    trending = tracker.get_trending_tickers(top_n=top_n)

    return {
        'trending': trending,
        'source': 'r/wallstreetbets',
        'timestamp': datetime.now().isoformat(),
        'count': len(trending)
    }


if __name__ == "__main__":
    # Test the tracker
    import json
    result = get_wsb_trending(top_n=10)
    print(json.dumps(result, indent=2))
