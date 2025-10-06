"""Fetch option chains and evaluate contracts using the modular scoring engine."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Dict, Iterable, List, Sequence

import numpy as np
import pandas as pd
import yfinance as yf
from scipy.stats import norm

from src.models.option import OptionContract, OptionGreeks
from src.models.signal import Signal
from src.scoring import CompositeScoringEngine


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
    expiration = pd.to_datetime(row.get("expiration"))
    T = max((expiration - datetime.utcnow()).days / 365.0, 0.0)
    sigma = float(row.get("impliedVolatility", 0.3))
    r = 0.05

    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return OptionGreeks()

    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if row.get("type") == "call":
        delta = norm.cdf(d1)
        theta = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T)) - r * K * np.exp(-r * T) * norm.cdf(d2)
    else:
        delta = -norm.cdf(-d1)
        theta = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T)) + r * K * np.exp(-r * T) * norm.cdf(-d2)

    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    return OptionGreeks(
        delta=round(float(delta), 4),
        gamma=round(float(gamma), 6),
        theta=round(float(theta) / 365, 4),
        vega=round(float(vega), 4),
    )


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


def detect_gamma_squeeze(options_df: pd.DataFrame, symbol: str, current_price: float) -> Dict[str, object]:
    try:
        calls = options_df[
            (options_df["type"] == "call")
            & (options_df["strike"] >= current_price * 0.98)
            & (options_df["strike"] <= current_price * 1.05)
        ]
        if calls.empty:
            return {"score": 0.0, "reasons": []}

        total_call_oi = float(calls["openInterest"].sum())
        total_call_volume = float(calls["volume"].sum())
        puts = options_df[
            (options_df["type"] == "put")
            & (options_df["strike"] >= current_price * 0.95)
            & (options_df["strike"] <= current_price * 1.02)
        ]
        put_call_ratio = 0.0
        if not puts.empty:
            total_put_oi = float(puts["openInterest"].sum())
            put_call_ratio = total_put_oi / max(total_call_oi, 1.0)

        score = 0.0
        reasons: List[str] = []
        if total_call_oi > 10_000:
            score += 30
            reasons.append(f"Massive call concentration ({total_call_oi:,.0f} OI)")
        if put_call_ratio < 0.5:
            score += 25
            reasons.append(f"Low put/call ratio ({put_call_ratio:.2f})")
        if total_call_volume > total_call_oi * 2:
            score += 20
            reasons.append(f"Extreme call volume ({total_call_volume:,.0f}) vs OI")

        return {"score": score, "reasons": reasons}
    except Exception:
        return {"score": 0.0, "reasons": []}


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
) -> Signal:
    greeks = calculate_greeks(row)
    contract = build_contract(row)
    market_data = {
        "volume_ratio": float(row.get("volume", 0.0)) / max(float(row.get("openInterest", 0.0)), 1.0),
        "spread_pct": (contract.ask - contract.bid) / max(contract.last_price, 0.01),
        "theta_ratio": abs(greeks.theta) / max(contract.last_price, 0.01),
        "moneyness": abs(contract.stock_price - contract.strike) / max(contract.stock_price, 0.01) if contract.stock_price else 0.0,
        "iv_rank": iv_rank,
        "gamma_squeeze": gamma_signal.get("score", 0.0),
    }
    projected_returns = compute_projected_returns(contract)
    market_data["projected_returns"] = projected_returns

    result = engine.score(contract, greeks, market_data)
    result.score.metadata.update(
        {
            "iv_rank": iv_rank,
            "projected_returns": projected_returns,
            "gamma_reasons": gamma_signal.get("reasons", []),
            "volume_ratio": market_data["volume_ratio"],
        }
    )
    return Signal.from_scoring_result(result)


def rank_options_for_symbol(symbol: str, engine: CompositeScoringEngine) -> List[Signal]:
    chain = get_options_chain(symbol)
    if chain is None or chain.empty:
        return []

    chain = chain.fillna(0)
    current_price = float(chain["stockPrice"].iloc[0]) if "stockPrice" in chain else 0.0
    iv_rank = calculate_iv_rank(symbol, float(chain.get("impliedVolatility", pd.Series([0])).mean()) * 100)
    gamma_signal = detect_gamma_squeeze(chain, symbol, current_price)

    signals: List[Signal] = []
    for _, row in chain.iterrows():
        signal = evaluate_contract(row, engine, iv_rank, gamma_signal)
        if signal.score.total_score >= 70:
            signals.append(signal)
    return sorted(signals, key=lambda s: s.score.total_score, reverse=True)


def scan_symbols(symbols: Sequence[str], limit_per_symbol: int = 5) -> List[Signal]:
    engine = CompositeScoringEngine()
    aggregated: List[Signal] = []
    for symbol in symbols:
        signals = rank_options_for_symbol(symbol, engine)[:limit_per_symbol]
        aggregated.extend(signals)
    return aggregated


def serialize_signals(signals: Iterable[Signal]) -> List[Dict[str, object]]:
    return [signal.dict() for signal in signals]


if __name__ == "__main__":
    watchlist = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ", "IWM", "AMD"]
    signals = scan_symbols(watchlist, limit_per_symbol=3)
    print(json.dumps(serialize_signals(signals), indent=2, default=str))

