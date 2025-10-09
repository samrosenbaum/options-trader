"""Base classes for directional prediction signals."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class Direction(Enum):
    """Directional bias enum."""

    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


@dataclass
class SignalResult:
    """Result from a single directional signal."""

    signal_name: str
    direction: Direction
    score: float  # -100 (very bearish) to +100 (very bullish)
    confidence: float  # 0-100, how confident is this signal
    rationale: str  # Human-readable explanation
    details: Dict[str, Any]  # Raw data for debugging
    timestamp: datetime

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "signal_name": self.signal_name,
            "direction": self.direction.value,
            "score": round(self.score, 2),
            "confidence": round(self.confidence, 2),
            "rationale": self.rationale,
            "details": self.details,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class DirectionalScore:
    """Aggregated directional prediction from multiple signals."""

    symbol: str
    direction: Direction
    score: float  # -100 to +100
    confidence: float  # 0-100
    signals: List[SignalResult]
    recommendation: str  # e.g., "Strong bullish bias - favor calls"
    timestamp: datetime

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "symbol": self.symbol,
            "direction": self.direction.value,
            "score": round(self.score, 2),
            "confidence": round(self.confidence, 2),
            "signals": [s.to_dict() for s in self.signals],
            "recommendation": self.recommendation,
            "timestamp": self.timestamp.isoformat(),
        }


class Signal(ABC):
    """Abstract base class for directional signals."""

    def __init__(self, name: str, weight: float = 1.0):
        """
        Initialize signal.

        Args:
            name: Human-readable name for this signal
            weight: Weight for this signal in aggregation (0-1)
        """
        self.name = name
        self.weight = weight
        self._historical_accuracy: Optional[float] = None

    @abstractmethod
    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate the directional signal.

        Args:
            data: Dictionary containing all available data for analysis
                  (price history, options data, volume, etc.)

        Returns:
            SignalResult with direction, score, confidence, and rationale
        """
        pass

    def set_historical_accuracy(self, accuracy: float) -> None:
        """Set the historical accuracy of this signal from backtesting."""
        self._historical_accuracy = accuracy

    def get_adjusted_confidence(self, raw_confidence: float) -> float:
        """
        Adjust confidence based on historical accuracy.

        If we know this signal has 65% historical accuracy, we should
        adjust its confidence accordingly.
        """
        if self._historical_accuracy is None:
            return raw_confidence

        # Scale confidence by historical accuracy
        # If signal has 80% historical accuracy and 90% confidence, adjust to 72%
        return raw_confidence * (self._historical_accuracy / 100.0)

    @abstractmethod
    def get_required_data(self) -> List[str]:
        """
        Return list of required data fields for this signal.

        Returns:
            List of data field names needed for calculate()
        """
        pass

    def validate_data(self, data: Dict[str, Any]) -> bool:
        """
        Validate that required data is present and valid.

        Args:
            data: Data dictionary to validate

        Returns:
            True if data is valid, False otherwise
        """
        required = self.get_required_data()
        for field in required:
            if field not in data or data[field] is None:
                return False
        return True
