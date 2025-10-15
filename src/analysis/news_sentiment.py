"""News sentiment utilities for swing detection."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Dict, Iterable, List, Optional

import yfinance as yf


@dataclass
class NewsHeadline:
    """Structured representation of a news headline."""

    title: str
    summary: str
    url: str
    publisher: str
    sentiment_score: float
    sentiment_label: str
    published_at: Optional[datetime] = None
    macro_events: Optional[List[str]] = None  # Detected macro events (Trump/China, Fed, etc.)

    def to_dict(self) -> Dict[str, object]:
        return {
            "title": self.title,
            "summary": self.summary,
            "url": self.url,
            "publisher": self.publisher,
            "sentiment_score": self.sentiment_score,
            "sentiment_label": self.sentiment_label,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "macro_events": self.macro_events or [],
        }


BULLISH_TERMS: Iterable[str] = (
    "surge",
    "rally",
    "beat",
    "upgrade",
    "outperform",
    "buyback",
    "partnership",
    "approval",
    "contract",
    "momentum",
    "record",
    "breakout",
    "squeeze",
)

BEARISH_TERMS: Iterable[str] = (
    "drop",
    "downgrade",
    "miss",
    "warning",
    "plunge",
    "lawsuit",
    "investigation",
    "default",
    "cut",
    "layoff",
    "regulatory",
    "delisting",
    "bankruptcy",
)

INTENSIFIERS: Iterable[str] = (
    "massive",
    "extreme",
    "historic",
    "record",
    "unprecedented",
)

# Macro event detection - these don't affect sentiment scoring, just provide context
MACRO_EVENT_CATEGORIES: Dict[str, Iterable[str]] = {
    "trade_war": ("tariff", "trade war", "china trade", "sanctions", "embargo", "duties", "import tax", "export ban"),
    "geopolitical": ("trump", "biden", "xi jinping", "putin", "ukraine", "taiwan", "israel", "middle east"),
    "monetary_policy": ("fed", "federal reserve", "interest rate", "rate hike", "rate cut", "powell", "fomc", "quantitative"),
    "economic_data": ("inflation", "cpi", "jobs report", "unemployment", "gdp", "retail sales", "housing starts", "pmi"),
    "sector_events": ("chip ban", "semiconductor", "oil embargo", "opec", "bank crisis", "tech regulation", "ai regulation"),
    "market_structure": ("circuit breaker", "trading halt", "market crash", "flash crash", "short squeeze", "gamma squeeze"),
}


def detect_macro_events(text: str) -> List[str]:
    """
    Detect macro market events in text (Trump/China, Fed, etc.).
    Returns list of detected event categories for informational purposes only.
    Does NOT affect sentiment scoring or filtering.
    """
    lowered = text.lower()
    detected = []

    for category, terms in MACRO_EVENT_CATEGORIES.items():
        if any(term in lowered for term in terms):
            detected.append(category)

    return detected


def score_sentiment(text: str) -> Dict[str, object]:
    """Return a normalized sentiment score for a block of text."""

    lowered = text.lower()
    score = 0

    for word in BULLISH_TERMS:
        if word in lowered:
            score += 1
    for word in BEARISH_TERMS:
        if word in lowered:
            score -= 1

    if any(word in lowered for word in INTENSIFIERS):
        score *= 1.5

    normalized = max(-1.0, min(1.0, score / 6))

    if normalized >= 0.35:
        label = "very_bullish"
    elif normalized >= 0.15:
        label = "bullish"
    elif normalized <= -0.35:
        label = "very_bearish"
    elif normalized <= -0.15:
        label = "bearish"
    else:
        label = "neutral"

    return {
        "score": round(normalized, 2),
        "label": label,
    }


def fetch_symbol_news(symbol: str, limit: int = 5) -> List[NewsHeadline]:
    """Fetch recent news for a symbol using yfinance."""

    try:
        ticker = yf.Ticker(symbol)
    except Exception:
        return []

    news_items = []
    try:
        raw_news = ticker.news or []
    except Exception:
        raw_news = []

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    for item in raw_news:
        # Handle both old and new yfinance news formats
        content = item.get("content", item)  # New format nests data under "content"

        title = content.get("title", "")
        summary = content.get("summary", content.get("description", ""))

        # Get publisher info
        provider = content.get("provider", {})
        publisher = provider.get("displayName", "") if isinstance(provider, dict) else content.get("publisher", "")

        # Get URL
        canonical = content.get("canonicalUrl", {})
        url = canonical.get("url", "") if isinstance(canonical, dict) else content.get("link", "")

        # Published time (providerPublishTime is seconds since epoch)
        published_at: Optional[datetime]
        publish_time = content.get("providerPublishTime") or content.get("pubDate")
        if publish_time:
            try:
                if isinstance(publish_time, (int, float)):
                    published_at = datetime.fromtimestamp(float(publish_time), tz=timezone.utc)
                else:
                    iso_str = str(publish_time)
                    if iso_str.endswith("Z"):
                        iso_str = iso_str.replace("Z", "+00:00")
                    published_at = datetime.fromisoformat(iso_str)
                    if published_at.tzinfo is None:
                        published_at = published_at.replace(tzinfo=timezone.utc)
                if published_at < cutoff:
                    continue
            except Exception:
                published_at = None
        else:
            published_at = None

        sentiment = score_sentiment(f"{title} {summary}")
        macro_events = detect_macro_events(f"{title} {summary}")
        news_items.append(
            NewsHeadline(
                title=title,
                summary=summary,
                url=url,
                publisher=publisher,
                sentiment_score=sentiment["score"],
                sentiment_label=sentiment["label"],
                published_at=published_at,
                macro_events=macro_events if macro_events else None,
            )
        )

        if len(news_items) >= limit:
            break

    return news_items
