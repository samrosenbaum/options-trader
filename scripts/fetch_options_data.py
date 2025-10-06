"""Fetch option chains and evaluate contracts using the modular scoring engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple
from uuid import uuid4

import numpy as np
import pandas as pd
import yfinance as yf
from scipy import stats
from scipy.stats import norm

POLITICAL_KEYWORDS = {
    "white house",
    "congress",
    "senate",
    "house",
    "regulation",
    "regulatory",
    "sec",
    "federal reserve",
    "treasury",
    "policy",
    "bill",
    "legislation",
    "tariff",
    "sanction",
    "subsidy",
}

AI_INFRA_KEYWORDS = {
    "artificial intelligence",
    "ai infrastructure",
    "ai chip",
    "data center",
    "gpu",
    "accelerator",
    "inference",
    "training cluster",
    "cloud compute",
}

HIGH_VOLATILITY_FOCUS = {
    "HOOD",
    "COIN",
    "PLTR",
    "SMCI",
    "AI",
    "MARA",
}

from src.config import AppSettings, get_settings
from src.models.option import OptionContract, OptionGreeks
from src.models.signal import Signal
from src.scoring import CompositeScoringEngine
from src.storage import OptionSnapshot, RunMetadata, SignalSnapshot
from src.storage.sqlite import SQLiteStorage


def get_options_chain(symbol: str) -> pd.DataFrame | None:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        current_price = info.get("currentPrice", info.get("regularMarketPrice", 0.0))
        expirations = ticker.options
        if not expirations:
            return None

        all_options: List[pd.DataFrame] = []
        for exp in expirations[:2]:
            opt_chain = ticker.option_chain(exp)
            calls = opt_chain.calls.assign(type="call", expiration=exp)
            puts = opt_chain.puts.assign(type="put", expiration=exp)
            options = pd.concat([calls, puts], ignore_index=True)
            options["symbol"] = symbol
            options["stockPrice"] = current_price
            all_options.append(options)

        return pd.concat(all_options, ignore_index=True) if all_options else None
    except Exception as exc:  # pragma: no cover - defensive logging
        print(f"Error fetching options for {symbol}: {exc}")
        return None


def calculate_greeks(row: pd.Series) -> OptionGreeks:
    S = float(row.get("stockPrice", 0.0))
    K = float(row.get("strike", 0.0))
    expiration_raw = row.get("expiration")
    expiration_ts = pd.to_datetime(expiration_raw)
    if pd.isna(expiration_ts):
        return OptionGreeks()
    if expiration_ts.tzinfo is None:
        expiration_ts = expiration_ts.tz_localize("UTC")
    else:
        expiration_ts = expiration_ts.tz_convert("UTC")
    now = datetime.now(timezone.utc)
    T = max((expiration_ts - pd.Timestamp(now)).total_seconds() / (365.0 * 24 * 60 * 60), 0.0)

    raw_sigma = row.get("impliedVolatility", 0.3)
    sigma = float(raw_sigma if raw_sigma not in (None, 0, 0.0) else 0.3)
    r = 0.05

    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return OptionGreeks()

    sigma = max(sigma, 1e-6)
    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    if row.get("type") == "call":
        delta = norm.cdf(d1)
        theta = -(S * norm.pdf(d1) * sigma) / (2 * sqrt_T) - r * K * np.exp(-r * T) * norm.cdf(d2)
    else:
        delta = -norm.cdf(-d1)
        theta = -(S * norm.pdf(d1) * sigma) / (2 * sqrt_T) + r * K * np.exp(-r * T) * norm.cdf(-d2)

    gamma = norm.pdf(d1) / (S * sigma * sqrt_T)
    vega = S * norm.pdf(d1) * sqrt_T / 100

    return OptionGreeks(
        delta=round(float(delta), 4),
        gamma=round(float(gamma), 6),
        theta=round(float(theta) / 365, 4),
        vega=round(float(vega), 4),
    )


def estimate_profit_probability(contract: OptionContract) -> Dict[str, object]:
    """Estimate probability of profiting by expiration and contextualize breakeven."""

    try:
        days_remaining = max(contract.days_to_expiration, 0)
    except Exception:
        days_remaining = 0

    if contract.stock_price <= 0 or contract.strike <= 0:
        return {
            "probability": 0.0,
            "required_move_pct": None,
            "breakeven_price": None,
            "explanation": "Insufficient price data to model profitability.",
        }

    sigma = float(contract.implied_volatility or 0.0)
    if sigma <= 0:
        sigma = 0.35

    expiration = datetime.combine(contract.expiration, datetime.min.time(), tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    T = max((expiration - now).total_seconds() / (365.0 * 24 * 60 * 60), 0.0)
    if T <= 0:
        return {
            "probability": 0.0,
            "required_move_pct": None,
            "breakeven_price": contract.strike,
            "explanation": "Option is at or past expiration so no profit probability could be estimated.",
        }

    if contract.option_type == "call":
        breakeven_price = contract.strike + contract.last_price
        required_move_pct = max(0.0, breakeven_price / max(contract.stock_price, 1e-6) - 1.0)
        direction = "rise"
        payoff_prob_fn = lambda z: 1 - norm.cdf(z)
    else:
        breakeven_price = max(contract.strike - contract.last_price, 0.01)
        required_move_pct = max(0.0, 1.0 - breakeven_price / max(contract.stock_price, 1e-6))
        direction = "fall"
        payoff_prob_fn = norm.cdf

    breakeven_price = max(breakeven_price, 0.01)
    log_ratio = np.log(breakeven_price / max(contract.stock_price, 1e-6))
    drift = (0.05 - 0.5 * sigma**2) * T
    denom = sigma * np.sqrt(T)
    if denom <= 0:
        probability = 0.0
    else:
        z = (log_ratio - drift) / denom
        probability = float(payoff_prob_fn(z))

    probability = float(max(0.0, min(1.0, probability)))
    move_pct = required_move_pct * 100 if required_move_pct is not None else None

    explanation = (
        f"{contract.symbol} needs to close above ${breakeven_price:.2f} "
        f"({move_pct:.1f}% {direction}) by expiration to break even. "
        if contract.option_type == "call"
        else f"{contract.symbol} needs to finish below ${breakeven_price:.2f} "
        f"({move_pct:.1f}% {direction}) by expiration to break even. "
    )
    explanation += (
        f"Using the implied volatility of {sigma * 100:.1f}% over {days_remaining} days, "
        f"the Black-Scholes model implies roughly a {probability * 100:.1f}% chance of finishing profitable."
    )

    return {
        "probability": probability,
        "required_move_pct": required_move_pct,
        "breakeven_price": breakeven_price,
        "days_to_expiration": days_remaining,
        "implied_vol": sigma * 100,
        "explanation": explanation,
    }


def summarize_risk_metrics(contract: OptionContract, projected_returns: Dict[str, float]) -> Dict[str, float]:
    max_return_pct = 0.0
    if projected_returns:
        max_return_pct = max(projected_returns.values()) * 100
    potential_return_pct = projected_returns.get("10%", 0.0) * 100 if projected_returns else 0.0

    premium_per_share = max(contract.last_price, 0.0)
    contract_cost = premium_per_share * 100
    if contract_cost <= 0:
        max_loss_pct = 0.0
        max_loss_amount = 0.0
    else:
        max_loss_pct = 100.0
        max_loss_amount = contract_cost

    asymmetry = max_return_pct / max(max_loss_pct, 1e-6)
    short_term_ratio = potential_return_pct / max(max_loss_pct, 1e-6)

    max_return_amount = (max_return_pct / 100) * contract_cost if contract_cost > 0 else 0.0
    potential_return_amount = (potential_return_pct / 100) * contract_cost if contract_cost > 0 else 0.0

    return {
        "max_return_pct": round(max_return_pct, 2),
        "max_return_amount": round(max_return_amount, 2),
        "max_loss_pct": round(max_loss_pct, 2),
        "max_loss_amount": round(max_loss_amount, 2),
        "ten_pct_move_return_amount": round(potential_return_amount, 2),
        "ten_pct_move_return_pct": round(potential_return_pct, 2),
        "reward_to_risk": round(asymmetry, 2),
        "ten_pct_move_reward_to_risk": round(short_term_ratio, 2),
    }


def calculate_iv_rank(symbol: str, current_iv: float) -> float:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        returns = np.log(hist["Close"] / hist["Close"].shift(1))
        rolling_vol = returns.rolling(window=30).std() * np.sqrt(252) * 100
        iv_low = float(rolling_vol.min())
        iv_high = float(rolling_vol.max())
        if iv_high == iv_low:
            return 50.0
        iv_rank = ((current_iv - iv_low) / (iv_high - iv_low)) * 100
        return round(max(0.0, min(100.0, iv_rank)), 2)
    except Exception:
        return 50.0


def calculate_iv_anomaly(symbol: str, current_iv: float) -> Dict[str, float]:
    """Return IV z-score, percentile, and realized vol spread metrics."""

    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        closes = hist["Close"].dropna()
        if closes.empty:
            raise ValueError("no history")

        returns = np.log(closes / closes.shift(1)).dropna()
        realized = returns.rolling(window=30).std() * np.sqrt(252) * 100
        realized = realized.dropna()
        if realized.empty:
            raise ValueError("insufficient realized volatility history")

        mean_iv = float(realized.mean())
        std_iv = float(realized.std(ddof=0))
        if std_iv == 0:
            raise ValueError("zero volatility dispersion")

        zscore = (current_iv - mean_iv) / std_iv
        percentile = stats.percentileofscore(realized, current_iv) / 100
        latest_realized = float(realized.iloc[-1])
        spread = current_iv - latest_realized

        return {
            "zscore": float(zscore),
            "percentile": float(percentile),
            "current_iv": float(current_iv),
            "mean_iv": mean_iv,
            "std_iv": std_iv,
            "realized_vol": latest_realized,
            "iv_rv_spread": float(spread),
            "observations": int(len(realized)),
        }
    except Exception:
        return {
            "zscore": None,
            "percentile": None,
            "current_iv": float(current_iv),
            "mean_iv": None,
            "std_iv": None,
            "realized_vol": None,
            "iv_rv_spread": None,
            "observations": 0,
        }


def _headline_sentiment(text: str) -> float:
    positive = [
        "surge",
        "rally",
        "record",
        "beat",
        "accelerate",
        "strong",
        "growth",
        "partnership",
        "upgrade",
        "expansion",
    ]
    negative = [
        "plunge",
        "selloff",
        "downgrade",
        "miss",
        "weak",
        "lawsuit",
        "probe",
        "delay",
        "risk",
        "cut",
    ]
    intensity = {"massive", "major", "unusual", "historic"}

    content = text.lower()
    score = 0.0
    for word in positive:
        if word in content:
            score += 1.0
    for word in negative:
        if word in content:
            score -= 1.0
    if any(word in content for word in intensity):
        score *= 1.2
    return max(-1.0, min(1.0, score / 6.0))


def _build_earnings_context(ticker: yf.Ticker) -> Dict[str, object]:
    context: Dict[str, object] = {}
    now = datetime.utcnow()
    try:
        earnings = ticker.get_earnings_dates(limit=6)
    except Exception:
        earnings = None

    if earnings is None or earnings.empty:
        return context

    schedule = earnings.copy()
    schedule.index = pd.to_datetime(schedule.index)
    upcoming = schedule[schedule.index >= pd.Timestamp(now.date())]

    if not upcoming.empty:
        next_date = upcoming.index[0].to_pydatetime()
        delta = (next_date - now).days
        context["earnings_in_days"] = float(delta)
        context["earnings_date"] = next_date.date().isoformat()
    else:
        last_date = schedule.index.sort_values(ascending=False)[0].to_pydatetime()
        delta = (now - last_date).days
        context["earnings_in_days"] = float(-delta)
        context["earnings_date"] = last_date.date().isoformat()

    return context


def _build_news_context(ticker: yf.Ticker) -> Dict[str, object]:
    context: Dict[str, object] = {}
    try:
        news_items = ticker.news or []
    except Exception:
        news_items = []

    if not news_items:
        return context

    total_sentiment = 0.0
    count = 0
    sample_headlines: List[Dict[str, str]] = []
    political_hits: set[str] = set()
    ai_hits: set[str] = set()

    for item in news_items[:8]:
        title = item.get("title", "")
        summary = item.get("summary", "")
        text = f"{title} {summary}".strip()
        if not text:
            continue

        sentiment = _headline_sentiment(text)
        total_sentiment += sentiment
        count += 1

        lowered = text.lower()
        for keyword in POLITICAL_KEYWORDS:
            if keyword in lowered:
                political_hits.add(keyword)
        for keyword in AI_INFRA_KEYWORDS:
            if keyword in lowered:
                ai_hits.add(keyword)

        if len(sample_headlines) < 3:
            sample_headlines.append(
                {
                    "title": title,
                    "url": item.get("link") or item.get("url", ""),
                    "sentiment": round(sentiment, 2),
                }
            )

    if count == 0:
        return context

    avg_sentiment = total_sentiment / count
    if avg_sentiment > 0.35:
        label = "very_bullish"
    elif avg_sentiment > 0.15:
        label = "bullish"
    elif avg_sentiment < -0.35:
        label = "very_bearish"
    elif avg_sentiment < -0.15:
        label = "bearish"
    else:
        label = "neutral"

    context.update(
        {
            "news_sentiment_score": round(avg_sentiment, 3),
            "news_sentiment_label": label,
            "news_headlines": sample_headlines,
            "political_hits": sorted(political_hits),
            "ai_infra_hits": sorted(ai_hits),
        }
    )
    return context


def _build_volatility_context(ticker: yf.Ticker, symbol: str) -> Dict[str, object]:
    context: Dict[str, object] = {}
    try:
        history = ticker.history(period="6mo")
        closes = history["Close"].dropna()
        if closes.empty:
            raise ValueError("no closes")
        returns = np.log(closes / closes.shift(1)).dropna()
        if returns.empty:
            raise ValueError("no returns")
        realized = float(returns.std() * np.sqrt(252))
    except Exception:
        realized = None

    if realized is not None:
        if realized >= 1.0:
            label = "extreme"
        elif realized >= 0.6:
            label = "elevated"
        elif realized >= 0.35:
            label = "above-average"
        else:
            label = "normal"
        context["realized_volatility"] = round(realized, 3)
        context["volatility_label"] = label

    if symbol.upper() in HIGH_VOLATILITY_FOCUS:
        context.setdefault("unique_drivers", []).append("focus-list-volatility")

    return context


def collect_event_context(symbol: str) -> Dict[str, object]:
    ticker = yf.Ticker(symbol)
    context: Dict[str, object] = {"symbol": symbol}

    earnings_context = _build_earnings_context(ticker)
    if earnings_context:
        context.update(earnings_context)

    news_context = _build_news_context(ticker)
    if news_context:
        context.update(news_context)

    volatility_context = _build_volatility_context(ticker, symbol)
    if volatility_context:
        context.update(volatility_context)

    unique_drivers = set(context.get("unique_drivers", []))
    if context.get("political_hits"):
        unique_drivers.add("policy tailwinds")
    if context.get("ai_infra_hits"):
        unique_drivers.add("AI infrastructure demand")
    if context.get("news_sentiment_label") in {"bullish", "very_bullish"}:
        unique_drivers.add("positive news momentum")
    if context.get("volatility_label") in {"elevated", "extreme"}:
        unique_drivers.add("high realized volatility")

    if unique_drivers:
        context["unique_drivers"] = sorted(unique_drivers)

    if set(context.keys()) == {"symbol"}:
        return {}

    return context


def detect_gamma_squeeze(options_df: pd.DataFrame, symbol: str, current_price: float) -> Dict[str, object]:
    """Estimate dealer gamma positioning around the underlying price."""

    try:
        if options_df.empty:
            return {"score": 0.0, "risk_level": "NONE", "reasons": []}

        frame = options_df.copy()
        frame["openInterest"] = frame["openInterest"].fillna(0).astype(float)
        frame["volume"] = frame["volume"].fillna(0).astype(float)
        frame["strike"] = frame["strike"].astype(float)

        # Calculate option gamma for each row to approximate dealer exposure.
        frame["gamma"] = frame.apply(lambda row: calculate_greeks(row).gamma, axis=1)

        exposures: List[Dict[str, float]] = []
        unique_strikes = sorted(frame["strike"].dropna().unique())

        for strike in unique_strikes:
            calls = frame[(frame["type"] == "call") & (frame["strike"] == strike)]
            puts = frame[(frame["type"] == "put") & (frame["strike"] == strike)]

            call_gamma = float((calls["gamma"] * calls["openInterest"]).sum())
            put_gamma = float((puts["gamma"] * puts["openInterest"]).sum())

            call_oi = float(calls["openInterest"].sum())
            put_oi = float(puts["openInterest"].sum())
            call_volume = float(calls["volume"].sum())

            # Assume dealers are net short calls (negative gamma) and net long puts (positive gamma).
            dealer_gamma = (-call_gamma * 100.0) + (put_gamma * 100.0)

            exposures.append(
                {
                    "strike": float(strike),
                    "net_gamma": dealer_gamma,
                    "call_oi": call_oi,
                    "put_oi": put_oi,
                    "call_volume": call_volume,
                }
            )

        if not exposures:
            return {"score": 0.0, "risk_level": "NONE", "reasons": []}

        exposures.sort(key=lambda item: item["strike"])

        # Identify strikes near the spot price where negative gamma is concentrated.
        nearby = [
            exp
            for exp in exposures
            if current_price > 0 and 0.95 <= exp["strike"] / current_price <= 1.05
        ]

        if not nearby:
            return {
                "score": 5.0,
                "risk_level": "LOW",
                "reasons": ["No concentrated dealer short gamma near spot"],
                "exposures": exposures[:10],
            }

        most_negative = min(nearby, key=lambda item: item["net_gamma"])
        max_short_gamma = most_negative["net_gamma"]
        max_strike = most_negative["strike"]

        def find_gamma_flip(nodes: List[Dict[str, float]]) -> float | None:
            for idx in range(len(nodes) - 1):
                left = nodes[idx]["net_gamma"]
                right = nodes[idx + 1]["net_gamma"]
                if left <= 0 and right >= 0:
                    return nodes[idx + 1]["strike"]
            return None

        gamma_flip = find_gamma_flip(exposures)

        severity = abs(max_short_gamma)
        if severity >= 150_000:
            risk_level = "EXTREME"
            base_score = 65.0
        elif severity >= 80_000:
            risk_level = "HIGH"
            base_score = 50.0
        elif severity >= 40_000:
            risk_level = "MODERATE"
            base_score = 35.0
        elif severity >= 15_000:
            risk_level = "LOW"
            base_score = 20.0
        else:
            risk_level = "MINIMAL"
            base_score = 10.0

        volume_ratio = most_negative["call_volume"] / max(most_negative["call_oi"], 1.0)

        reasons = [
            f"Dealers short {abs(max_short_gamma):,.0f} gamma at ${max_strike:.2f}",
            f"Call volume/OI ratio {volume_ratio:.1f} near squeeze strike",
        ]

        if gamma_flip is not None:
            reasons.append(f"Gamma flip projected near ${gamma_flip:.2f}")

        return {
            "score": base_score,
            "risk_level": risk_level,
            "max_short_gamma": max_short_gamma,
            "squeeze_strike": max_strike,
            "gamma_flip": gamma_flip,
            "call_volume_ratio": volume_ratio,
            "reasons": reasons,
            "exposures": exposures[:10],
        }
    except Exception:
        return {"score": 0.0, "risk_level": "ERROR", "reasons": []}


def compute_projected_returns(contract: OptionContract) -> Dict[str, float]:
    results: Dict[str, float] = {}
    for move_pct in (0.10, 0.20, 0.30):
        if contract.option_type == "call":
            target_price = contract.stock_price * (1 + move_pct)
            intrinsic = max(0.0, target_price - contract.strike)
        else:
            target_price = contract.stock_price * (1 - move_pct)
            intrinsic = max(0.0, contract.strike - target_price)
        potential_return = max(0.0, intrinsic - contract.last_price)
        risk_reward = potential_return / max(contract.last_price, 0.01)
        results[f"{int(move_pct * 100)}%"] = round(risk_reward, 2)
    return results


def build_contract(row: pd.Series) -> OptionContract:
    payload = row.to_dict()
    for key in ["bid", "ask", "lastPrice", "impliedVolatility", "stockPrice", "strike"]:
        value = payload.get(key)
        if pd.isna(value):
            payload[key] = 0.0
    for key in ["volume", "openInterest"]:
        value = payload.get(key)
        if pd.isna(value):
            payload[key] = 0
    payload["raw"] = row.to_dict()
    return OptionContract.parse_obj(payload)


def evaluate_contract(
    row: pd.Series,
    engine: CompositeScoringEngine,
    iv_rank: float,
    gamma_signal: Dict[str, object],
    iv_anomaly: Dict[str, float],
    event_context: Dict[str, object],
) -> Signal:
    greeks = calculate_greeks(row)
    contract = build_contract(row)
    contract = contract.copy(update={"greeks": greeks})
    market_data = {
        "volume_ratio": float(row.get("volume", 0.0)) / max(float(row.get("openInterest", 0.0)), 1.0),
        "spread_pct": (contract.ask - contract.bid) / max(contract.last_price, 0.01),
        "theta_ratio": abs(greeks.theta) / max(contract.last_price, 0.01),
        "moneyness": abs(contract.stock_price - contract.strike) / max(contract.stock_price, 0.01) if contract.stock_price else 0.0,
        "iv_rank": iv_rank,
        "gamma_squeeze": gamma_signal,
        "iv_anomaly": iv_anomaly,
    }
    projected_returns = compute_projected_returns(contract)
    market_data["projected_returns"] = projected_returns
    profit_probability = estimate_profit_probability(contract)
    risk_metrics = summarize_risk_metrics(contract, projected_returns)
    market_data["profit_probability"] = profit_probability
    market_data["risk_metrics"] = risk_metrics
    if event_context:
        market_data["event_intel"] = event_context

    result = engine.score(contract, greeks, market_data)
    result.score.metadata.update(
        {
            "iv_rank": iv_rank,
            "iv_anomaly": iv_anomaly,
            "gamma_signal": gamma_signal,
            "projected_returns": projected_returns,
            "gamma_reasons": gamma_signal.get("reasons", []),
            "volume_ratio": market_data["volume_ratio"],
            "profit_probability": profit_probability,
            "risk_metrics": risk_metrics,
        }
    )
    if event_context:
        result.score.metadata["event_intel"] = event_context
    return Signal.from_scoring_result(result)


def rank_options_for_symbol(symbol: str, engine: CompositeScoringEngine) -> Tuple[List[Signal], pd.DataFrame | None]:
    chain = get_options_chain(symbol)
    if chain is None or chain.empty:
        return [], None

    chain = chain.fillna(0)
    current_price = float(chain["stockPrice"].iloc[0]) if "stockPrice" in chain else 0.0
    avg_iv = float(chain.get("impliedVolatility", pd.Series([0])).mean()) * 100
    iv_rank = calculate_iv_rank(symbol, avg_iv)
    iv_anomaly = calculate_iv_anomaly(symbol, avg_iv)
    gamma_signal = detect_gamma_squeeze(chain, symbol, current_price)
    event_context = collect_event_context(symbol)

    signals: List[Signal] = []
    for _, row in chain.iterrows():
        signal = evaluate_contract(row, engine, iv_rank, gamma_signal, iv_anomaly, event_context)
        if signal.score.total_score >= 70:
            signals.append(signal)
    return sorted(signals, key=lambda s: s.score.total_score, reverse=True), chain


def scan_symbols(
    symbols: Sequence[str],
    limit_per_symbol: int = 5,
    engine: CompositeScoringEngine | None = None,
) -> Tuple[List[Signal], Dict[str, pd.DataFrame]]:
    engine = engine or CompositeScoringEngine()
    aggregated: List[Signal] = []
    chains: Dict[str, pd.DataFrame] = {}
    for symbol in symbols:
        ranked, chain = rank_options_for_symbol(symbol, engine)
        if chain is not None:
            chains[symbol] = chain
        if ranked:
            aggregated.extend(ranked[:limit_per_symbol])
    return aggregated, chains


def serialize_signals(signals: Iterable[Signal]) -> List[Dict[str, object]]:
    return [signal.dict() for signal in signals]


def _build_option_snapshots(symbol: str, chain: pd.DataFrame) -> List[OptionSnapshot]:
    snapshots: List[OptionSnapshot] = []
    for record in chain.to_dict(orient="records"):
        snapshots.append(
            OptionSnapshot(
                symbol=symbol,
                option_type=str(record.get("type", "")).lower(),
                expiration=str(record.get("expiration", "")),
                strike=float(record.get("strike", 0.0)),
                contract_symbol=record.get("contractSymbol"),
                data=record,
            )
        )
    return snapshots


def _build_signal_snapshots(signals: Sequence[Signal]) -> List[SignalSnapshot]:
    snapshots: List[SignalSnapshot] = []
    for signal in signals:
        contract_symbol = None
        if signal.contract.raw:
            contract_symbol = signal.contract.raw.get("contractSymbol")
        snapshots.append(
            SignalSnapshot(
                symbol=signal.symbol,
                option_type=signal.contract.option_type,
                score=signal.score.total_score,
                contract_symbol=contract_symbol,
                data=signal.dict(by_alias=True),
            )
        )
    return snapshots


def _create_storage(settings: AppSettings) -> SQLiteStorage:
    sqlite_settings = settings.storage.require_sqlite()
    return SQLiteStorage(sqlite_settings.path, pragmas=sqlite_settings.pragmas)


def _persist_scan_results(
    settings: AppSettings,
    watchlist_name: str,
    watchlist: Sequence[str],
    signals: List[Signal],
    chains: Mapping[str, pd.DataFrame],
) -> None:
    if not chains and not signals:
        return

    storage = _create_storage(settings)
    total_options = sum(len(df) for df in chains.values())
    metadata = RunMetadata(
        run_id=uuid4().hex,
        run_at=datetime.utcnow(),
        environment=settings.env,
        watchlist=watchlist_name,
        extra={
            "symbols": list(watchlist),
            "signal_count": len(signals),
            "option_snapshot_count": total_options,
        },
    )
    option_snapshots: List[OptionSnapshot] = []
    for symbol, chain in chains.items():
        option_snapshots.extend(_build_option_snapshots(symbol, chain))
    signal_snapshots = _build_signal_snapshots(signals)
    storage.save_run(metadata, option_snapshots, signal_snapshots)


if __name__ == "__main__":
    settings = get_settings()
    watchlist_name = "default"
    watchlist = settings.get_watchlist(watchlist_name)
    engine = CompositeScoringEngine(settings.scoring_dict())
    signals, chains = scan_symbols(watchlist, limit_per_symbol=3, engine=engine)
    _persist_scan_results(settings, watchlist_name, watchlist, signals, chains)
    print(json.dumps(serialize_signals(signals), indent=2, default=str))

