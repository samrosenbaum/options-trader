"""Composite scoring model for the Sharp Move scanner."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np


@dataclass(frozen=True)
class ScoringWeights:
    w_event: float
    w_vol: float
    w_tech: float
    w_flow: float
    w_micro: float


@dataclass(frozen=True)
class EventWindows:
    earnings_days: int
    macro_days: int


@dataclass(frozen=True)
class ScoreBreakdown:
    total: float
    components: Dict[str, float]


def _clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return float(max(lower, min(upper, value)))


def _event_score(row: Dict[str, object], windows: EventWindows) -> float:
    if not row.get("event_flag"):
        return 20.0
    days = row.get("days_to_event")
    if days is None:
        return 30.0
    try:
        days_int = int(days)
    except Exception:
        return 30.0
    if abs(days_int) <= windows.earnings_days:
        return 85.0
    if abs(days_int) <= windows.macro_days:
        return 70.0
    return 50.0


def _volatility_score(row: Dict[str, object]) -> float:
    iv = float(row.get("iv", 0.0) or 0.0)
    iv_rank = float(row.get("iv_rank", 0.0) or 0.0)
    hv = float(row.get("hv20", 0.0) or 0.0)
    spread = float(row.get("iv_minus_hv", 0.0) or 0.0)
    dist_be = abs(float(row.get("dist_to_be_pct", 0.0) or 0.0))
    expected = float(row.get("expected_move", 0.0) or 0.0)
    spot = float(row.get("spot", 0.0) or 0.0)
    expected_pct = (expected / spot * 100.0) if spot > 0 else expected
    if expected_pct > 0:
        move_alignment = 1 - min(dist_be / expected_pct, 1.5)
    else:
        move_alignment = 0.3
    rank_bonus = 1 - abs(iv_rank - 50.0) / 50.0
    hv_bonus = 1 - abs(spread) / (max(hv, 1e-6) * 2)
    raw = 60 * move_alignment + 25 * max(rank_bonus, 0.0) + 15 * max(hv_bonus, 0.0)
    return _clamp(raw)


def _technical_score(row: Dict[str, object]) -> float:
    score = 0.0
    if row.get("ema8_gt_ema21"):
        score += 25
    if row.get("breakout_20d_high"):
        score += 25
    if row.get("rsi14") is not None:
        rsi = float(row["rsi14"])
        if 45 <= rsi <= 70:
            score += 25
        elif 30 <= rsi < 45 or 70 < rsi <= 75:
            score += 15
    vol_spike = row.get("vol_spike")
    if vol_spike is not None:
        ratio = float(vol_spike)
        if ratio >= 1.5:
            score += 15
        elif ratio >= 1.2:
            score += 10
    bb_width = row.get("bb_width_pct")
    if bb_width is not None:
        width = float(bb_width)
        if width <= 0:
            pass
        elif width < 0.05:
            score += 10
        elif width < 0.15:
            score += 5
    return _clamp(score)


def _flow_score(row: Dict[str, object]) -> float:
    ratio = row.get("flow_calls_ratio")
    net = row.get("flow_net_premium")
    if ratio is None and net is None:
        return 40.0  # Neutral baseline so flow weight still contributes.
    score = 40.0
    if ratio is not None:
        try:
            ratio_val = float(ratio)
        except Exception:
            ratio_val = 0.0
        score += np.sign(ratio_val - 1.0) * min(abs(ratio_val - 1.0) * 20, 20)
    if net is not None:
        try:
            net_val = float(net)
        except Exception:
            net_val = 0.0
        score += np.sign(net_val) * min(abs(net_val) / 10000.0 * 20, 20)
    return _clamp(score)


def _microstructure_score(row: Dict[str, object]) -> float:
    spread_pct = float(row.get("spread_pct", 0.0) or 0.0)
    liquidity = float(row.get("volume", 0.0) or 0.0) + float(row.get("open_interest", 0.0) or 0.0)
    delta = abs(float(row.get("delta", 0.0) or 0.0))
    mid = float(row.get("mid", 0.0) or 0.0)
    score = 0.0
    if spread_pct <= 0.03:
        score += 40
    elif spread_pct <= 0.06:
        score += 25
    elif spread_pct <= 0.1:
        score += 10
    if liquidity >= 2000:
        score += 30
    elif liquidity >= 1000:
        score += 20
    elif liquidity >= 500:
        score += 10
    if 0.3 <= delta <= 0.6:
        score += 20
    elif 0.2 <= delta < 0.3 or 0.6 < delta <= 0.7:
        score += 10
    if mid >= 0.5:
        score += 10
    return _clamp(score)


def score_row(row: Dict[str, object], weights: ScoringWeights, windows: EventWindows) -> ScoreBreakdown:
    components = {
        "event": _event_score(row, windows),
        "vol": _volatility_score(row),
        "tech": _technical_score(row),
        "flow": _flow_score(row),
        "micro": _microstructure_score(row),
    }
    total = (
        components["event"] * weights.w_event
        + components["vol"] * weights.w_vol
        + components["tech"] * weights.w_tech
        + components["flow"] * weights.w_flow
        + components["micro"] * weights.w_micro
    )
    return ScoreBreakdown(total=_clamp(total), components=components)


__all__ = ["ScoringWeights", "EventWindows", "ScoreBreakdown", "score_row"]
