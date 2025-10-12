#!/usr/bin/env python3
"""Generate an institutional-style snapshot for the top crypto assets."""

from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence


CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent

if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from crypto_scanner import CryptoScanner  # noqa: E402


OUTPUT_PATH = ROOT_DIR / "outputs" / "crypto_institutional_snapshot.md"
SAMPLE_DATA_PATH = ROOT_DIR / "data" / "sample_crypto_snapshot.json"


def format_usd(value: float) -> str:
    """Format numeric values as human readable USD strings."""

    if value is None or math.isfinite(value) is False:
        return "$0"
    abs_value = abs(value)
    if abs_value >= 1_000_000_000:
        formatted = f"${value / 1_000_000_000:.2f}B"
    elif abs_value >= 1_000_000:
        formatted = f"${value / 1_000_000:.2f}M"
    elif abs_value >= 1_000:
        formatted = f"${value / 1_000:.2f}K"
    else:
        formatted = f"${value:,.2f}"
    return formatted


def format_percent(value: float | None, *, decimals: int = 1) -> str:
    """Format a value as a signed percentage."""

    if value is None or math.isfinite(value) is False:
        return "N/A"
    return f"{value:+.{decimals}f}%"


def truncate_reasons(sections: Sequence[List[str]], limit: int = 3) -> List[str]:
    """Return the first distinct reasons up to the limit."""

    seen = set()
    ordered: List[str] = []
    for reasons in sections:
        for reason in reasons:
            cleaned = reason.strip()
            if cleaned and cleaned not in seen:
                ordered.append(cleaned)
                seen.add(cleaned)
            if len(ordered) >= limit:
                return ordered
    return ordered


def build_asset_section(asset: Dict) -> List[str]:
    """Construct the markdown section for a single asset."""

    lines: List[str] = []
    name = asset.get("name", "Unknown")
    symbol = asset.get("symbol", "?")
    header = f"### {symbol} ({name})"
    lines.append(header)

    metrics = asset.get("metrics", {})
    flow = asset.get("flow", {})
    technical = asset.get("technical", {})
    fundamentals = asset.get("fundamentals", {})
    sentiment = asset.get("sentiment", {})
    derivatives = asset.get("derivatives", {})
    onchain = asset.get("onchain", {})
    direction = asset.get("direction", {})
    news = asset.get("news", {})

    composite_score = asset.get("composite_score")
    score_breakdown = asset.get("score_breakdown", {})
    score_line = (
        f"**Composite Score:** {composite_score:.0f}/100"
        f" (Volume {score_breakdown.get('volume', 0):.0f},"
        f" Technical {score_breakdown.get('technical', 0):.0f},"
        f" Fundamentals {score_breakdown.get('fundamentals', 0):.0f},"
        f" Sentiment {score_breakdown.get('sentiment', 0):.0f})"
    )

    if direction:
        score_line += (
            f" — Directional Bias: {direction.get('direction', 'neutral').capitalize()}"
            f" ({direction.get('confidence', 0)}% confidence, score {direction.get('score', 0)})"
        )
    lines.append(score_line)

    price_line = (
        f"- **Price Action:** {format_usd(metrics.get('price', 0.0))}"
        f" ({format_percent(metrics.get('change_24h'))} 24h,"
        f" {format_percent(technical.get('price_change_7d'))} 7d)"
    )
    if technical.get("volatility") is not None:
        price_line += f" — Realized vol {technical.get('volatility', 0):.1f}%"
    lines.append(price_line)

    flow_line = (
        f"- **Flow & Liquidity:** {format_usd(flow.get('volume_24h', 0.0))} traded ("
        f"{format_percent(flow.get('volume_change_24h'))} vs 24h avg,"
        f" volume/market-cap {flow.get('volume_market_cap_ratio', 0):.1f}%)"
    )
    lines.append(flow_line)

    derivatives_line = (
        "- **Derivatives Positioning:** "
        f"Funding {format_percent(derivatives.get('avg_funding_rate', 0.0) * 100 if derivatives else None, decimals=3)}"
        f", basis {format_percent(derivatives.get('avg_basis', 0.0) * 100 if derivatives else None)}"
        f", OI ratio {format_percent(derivatives.get('open_interest_ratio', 0.0) * 100 if derivatives else None)}"
        f" — Bias {derivatives.get('long_short_bias', 'balanced')}"
    )
    lines.append(derivatives_line)

    supply_ratio = fundamentals.get("supply_ratio")
    catalysts = []
    if sentiment.get("ath_percentage") is not None:
        catalysts.append(f"{sentiment.get('ath_percentage', 0):+.1f}% vs ATH")
    if supply_ratio is not None:
        catalysts.append(f"Circulating supply {supply_ratio:.1f}%")
    if onchain.get("macro_bias") is not None and onchain:
        catalysts.append(
            f"Macro bias {onchain.get('macro_bias', 0):+.2f} ({onchain.get('macro_context', {}).get('classification', 'n/a')})"
        )
    catalyst_line = "- **On-chain & Macro:** " + ", ".join(catalysts) if catalysts else "- **On-chain & Macro:** Data limited"
    lines.append(catalyst_line)

    top_reasons = truncate_reasons(
        [
            flow.get("reasons", []),
            technical.get("reasons", []),
            fundamentals.get("reasons", []),
            sentiment.get("reasons", []),
        ],
        limit=4,
    )
    if top_reasons:
        lines.append("- **Institutional Signals:**")
        for reason in top_reasons:
            lines.append(f"  - {reason}")

    top_headlines = news.get("top_headlines") or []
    if top_headlines:
        lines.append("- **Potential News Catalysts:**")
        for headline in top_headlines[:3]:
            lines.append(f"  - {headline}")

    lines.append("")
    return lines


def _load_sample_snapshot() -> Dict:
    """Load packaged sample data when live APIs are unavailable."""

    if not SAMPLE_DATA_PATH.exists():
        return {}

    try:
        with SAMPLE_DATA_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        print(f"Failed to load sample snapshot: {exc}")
        return {}


def main() -> None:
    scanner = CryptoScanner()

    macro_snapshot = scanner.fetch_macro_context()
    if macro_snapshot:
        scanner.fetch_macro_context = lambda: macro_snapshot  # type: ignore[assignment]

    watchlist = scanner.crypto_watchlist[:5]
    assets: List[Dict] = []

    for index, coin_id in enumerate(watchlist):
        if index:
            time.sleep(1.1)

        coin_data = scanner.get_crypto_data(coin_id)
        if not coin_data:
            continue

        price_history, price_df = scanner.get_price_history_with_dataframe(coin_id, days=90)
        volume_analysis = scanner.analyze_volume_patterns(coin_data)
        technical_analysis = scanner.analyze_technical_indicators(price_history)
        fundamentals_analysis = scanner.analyze_fundamentals(coin_data)
        sentiment_analysis = scanner.analyze_market_sentiment(coin_data)
        directional_bias = scanner.calculate_directional_bias(coin_id, coin_data, price_df)

        insights = directional_bias.get("insights", {}) if directional_bias else {}
        derivatives_metrics = insights.get("derivatives", {})
        news_sentiment = insights.get("news", {})
        onchain_metrics = insights.get("onchain", {})

        market_data = coin_data.get("market_data", {})
        price = float(market_data.get("current_price", {}).get("usd", 0) or 0)
        volume_24h = float(market_data.get("total_volume", {}).get("usd", 0) or 0)

        total_score = (
            volume_analysis.get("score", 0)
            + technical_analysis.get("score", 0)
            + fundamentals_analysis.get("score", 0)
            + sentiment_analysis.get("score", 0)
        )

        assets.append(
            {
                "coin_id": coin_id,
                "name": coin_data.get("name", coin_id.replace("-", " ").title()),
                "symbol": coin_data.get("symbol", coin_id).upper(),
                "metrics": {
                    "price": price,
                    "change_24h": market_data.get("price_change_percentage_24h"),
                },
                "flow": {
                    **volume_analysis,
                    "volume_24h": volume_24h,
                },
                "technical": technical_analysis,
                "fundamentals": fundamentals_analysis,
                "sentiment": sentiment_analysis,
                "derivatives": derivatives_metrics,
                "onchain": onchain_metrics,
                "direction": directional_bias,
                "news": news_sentiment,
                "composite_score": total_score,
                "score_breakdown": {
                    "volume": volume_analysis.get("score", 0),
                    "technical": technical_analysis.get("score", 0),
                    "fundamentals": fundamentals_analysis.get("score", 0),
                    "sentiment": sentiment_analysis.get("score", 0),
                },
            }
        )

    assets.sort(key=lambda item: item.get("composite_score", 0), reverse=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines: List[str] = [
        "# Institutional Crypto Market Snapshot",
        f"_Generated {timestamp}_",
        "",
    ]

    using_sample = False
    macro_section: List[str] = []

    if macro_snapshot:
        macro_section = [
            "## Market Regime",
            (
                "- Fear & Greed Index: "
                f"{macro_snapshot.get('fear_greed_value')} ({macro_snapshot.get('classification', 'n/a')})"
            ),
            f"- Macro bias score: {macro_snapshot.get('macro_bias', 0):+.2f}",
            "",
        ]

    if not assets:
        sample_payload = _load_sample_snapshot()
        if sample_payload:
            using_sample = True
            if not macro_snapshot:
                macro_snapshot = sample_payload.get("macro")
                if macro_snapshot:
                    macro_section = [
                        "## Market Regime",
                        (
                            "- Fear & Greed Index: "
                            f"{macro_snapshot.get('fear_greed_value')} ({macro_snapshot.get('classification', 'n/a')})"
                        ),
                        f"- Macro bias score: {macro_snapshot.get('macro_bias', 0):+.2f}",
                        "",
                    ]
            assets = sample_payload.get("assets", [])
            sample_note = sample_payload.get("note")
            if sample_note:
                macro_section.append(sample_note)

    if macro_section:
        lines.extend(macro_section)

    lines.append("## Asset Signals")
    lines.append("")

    if not assets:
        lines.append("No assets could be evaluated. API limits may have been hit.")
    else:
        if using_sample:
            generated = sample_payload.get("generated")
            if generated:
                lines.append(f"_Using archived market snapshot from {generated}_")
                lines.append("")
        for asset in assets:
            if "composite_score" not in asset:
                breakdown = asset.get("score_breakdown", {})
                asset["composite_score"] = sum(
                    breakdown.get(key, 0) for key in ("volume", "technical", "fundamentals", "sentiment")
                )
            lines.extend(build_asset_section(asset))

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

