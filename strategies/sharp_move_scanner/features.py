"""Feature engineering helpers for the Sharp Move scanner."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class TechnicalSnapshot:
    """Container for derived technical indicators."""

    bb_width_pct: Optional[float]
    ema8_gt_ema21: Optional[bool]
    breakout_20d_high: Optional[bool]
    breakout_20d_low: Optional[bool]
    rsi14: Optional[float]
    volume_spike: Optional[float]
    atr14: Optional[float]

    def to_dict(self) -> Dict[str, Optional[float | bool]]:
        return {
            "bb_width_pct": self.bb_width_pct,
            "ema8_gt_ema21": self.ema8_gt_ema21,
            "breakout_20d_high": self.breakout_20d_high,
            "breakout_20d_low": self.breakout_20d_low,
            "rsi14": self.rsi14,
            "vol_spike": self.volume_spike,
            "atr14": self.atr14,
        }


def _annualized_volatility(series: pd.Series, trading_days: int = 252) -> Optional[float]:
    if series is None or series.empty:
        return None
    log_returns = np.log(series / series.shift(1)).dropna()
    if log_returns.empty:
        return None
    daily_std = log_returns.std()
    if not math.isfinite(float(daily_std)):
        return None
    return float(daily_std * math.sqrt(trading_days))


def realized_volatility(history: pd.DataFrame, window: int = 20) -> Optional[float]:
    """Compute historical volatility over the requested window."""

    if history.empty or "Close" not in history:
        return None
    closes = history["Close"].tail(window + 1)
    if len(closes) < window:
        return None
    return _annualized_volatility(closes)


def bollinger_band_width(history: pd.DataFrame, window: int = 20) -> Optional[float]:
    if history.empty or "Close" not in history:
        return None
    close = history["Close"]
    if len(close) < window:
        return None
    sma = close.rolling(window).mean()
    std = close.rolling(window).std()
    if sma.isna().all() or std.isna().all():
        return None
    latest_sma = sma.iloc[-1]
    latest_std = std.iloc[-1]
    if latest_sma == 0 or np.isnan(latest_sma) or np.isnan(latest_std):
        return None
    upper = latest_sma + 2 * latest_std
    lower = latest_sma - 2 * latest_std
    width_pct = (upper - lower) / latest_sma
    if not math.isfinite(width_pct):
        return None
    return float(width_pct)


def ema_cross_signal(history: pd.DataFrame, fast: int = 8, slow: int = 21) -> Optional[bool]:
    if history.empty or "Close" not in history:
        return None
    close = history["Close"]
    if len(close) < slow:
        return None
    ema_fast = close.ewm(span=fast, adjust=False).mean().iloc[-1]
    ema_slow = close.ewm(span=slow, adjust=False).mean().iloc[-1]
    if any(np.isnan([ema_fast, ema_slow])):
        return None
    return bool(ema_fast > ema_slow)


def breakout_signal(history: pd.DataFrame, window: int = 20, high: bool = True) -> Optional[bool]:
    if history.empty or "Close" not in history:
        return None
    close = history["Close"]
    if len(close) < window:
        return None
    if high:
        rolling = close.rolling(window).max()
        return bool(close.iloc[-1] >= rolling.iloc[-1]) if not np.isnan(rolling.iloc[-1]) else None
    rolling = close.rolling(window).min()
    return bool(close.iloc[-1] <= rolling.iloc[-1]) if not np.isnan(rolling.iloc[-1]) else None


def rsi(history: pd.DataFrame, window: int = 14) -> Optional[float]:
    if history.empty or "Close" not in history:
        return None
    close = history["Close"]
    if len(close) < window + 1:
        return None
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window).mean().iloc[-1]
    avg_loss = loss.rolling(window).mean().iloc[-1]
    if np.isnan(avg_gain) or np.isnan(avg_loss):
        return None
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    rsi_val = 100 - (100 / (1 + rs))
    if not math.isfinite(rsi_val):
        return None
    return float(rsi_val)


def volume_spike_ratio(history: pd.DataFrame, window: int = 20) -> Optional[float]:
    if history.empty or "Volume" not in history:
        return None
    volume = history["Volume"]
    if len(volume) < window:
        return None
    avg_volume = volume.rolling(window).mean().iloc[-1]
    latest_volume = volume.iloc[-1]
    if avg_volume <= 0 or np.isnan(avg_volume):
        return None
    ratio = latest_volume / avg_volume
    if not math.isfinite(ratio):
        return None
    return float(ratio)


def average_true_range(history: pd.DataFrame, window: int = 14) -> Optional[float]:
    required_cols = {"High", "Low", "Close"}
    if history.empty or not required_cols.issubset(history.columns):
        return None
    data = history[["High", "Low", "Close"]].copy()
    if len(data) < window + 1:
        return None
    high_low = data["High"] - data["Low"]
    high_close = (data["High"] - data["Close"].shift()).abs()
    low_close = (data["Low"] - data["Close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr_series = tr.rolling(window).mean()
    atr = atr_series.iloc[-1]
    if np.isnan(atr):
        return None
    return float(atr)


def compute_technical_snapshot(history: pd.DataFrame) -> TechnicalSnapshot:
    """Return the set of technical indicators required by the strategy."""

    return TechnicalSnapshot(
        bb_width_pct=bollinger_band_width(history),
        ema8_gt_ema21=ema_cross_signal(history),
        breakout_20d_high=breakout_signal(history, window=20, high=True),
        breakout_20d_low=breakout_signal(history, window=20, high=False),
        rsi14=rsi(history),
        volume_spike=volume_spike_ratio(history),
        atr14=average_true_range(history),
    )


__all__ = [
    "TechnicalSnapshot",
    "compute_technical_snapshot",
    "realized_volatility",
    "bollinger_band_width",
    "ema_cross_signal",
    "breakout_signal",
    "rsi",
    "volume_spike_ratio",
    "average_true_range",
]
