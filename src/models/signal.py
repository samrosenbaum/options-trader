from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .option import OptionContract, OptionScore, OptionGreeks, ScoringResult


class Signal(BaseModel):
    """Structured trading signal produced by the scoring engine."""

    symbol: str
    contract: OptionContract
    greeks: OptionGreeks
    score: OptionScore
    confidence: float = 0.0
    reasons: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_scoring_result(cls, result: ScoringResult, metadata: Dict[str, Any] | None = None) -> "Signal":
        return cls(
            symbol=result.contract.symbol,
            contract=result.contract,
            greeks=result.greeks,
            score=result.score,
            confidence=result.score.confidence,
            reasons=result.score.reasons,
            tags=result.score.tags,
            metadata=metadata or result.score.metadata,
        )


class MarketNewsItem(BaseModel):
    headline: str
    sentiment: float


class MarketContext(BaseModel):
    symbol: str
    price: float
    volume: float
    volatility: Optional[float] = None
    news: List[MarketNewsItem] = Field(default_factory=list)
    technicals: Dict[str, Any] = Field(default_factory=dict)


class ScanTarget(BaseModel):
    contract: OptionContract
    greeks: OptionGreeks = Field(default_factory=OptionGreeks)
    market_data: Dict[str, float] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScanRequest(BaseModel):
    targets: List[ScanTarget]
    market_context: Dict[str, MarketContext] = Field(default_factory=dict)
    scoring_config: Dict[str, Any] = Field(default_factory=dict)


class ScanError(BaseModel):
    symbol: str
    reason: str


class ScanResponse(BaseModel):
    signals: List[Signal] = Field(default_factory=list)
    errors: List[ScanError] = Field(default_factory=list)


class CustomScanRequest(BaseModel):
    """Request model for custom user-defined scanner"""
    targets: List[ScanTarget]
    market_context: Dict[str, MarketContext] = Field(default_factory=dict)

    # Filter criteria
    min_volume: Optional[int] = None
    min_open_interest: Optional[int] = None
    max_spread_percent: Optional[float] = None

    # Greeks ranges
    min_delta: Optional[float] = None
    max_delta: Optional[float] = None
    min_gamma: Optional[float] = None
    max_gamma: Optional[float] = None
    min_theta: Optional[float] = None
    max_theta: Optional[float] = None
    min_vega: Optional[float] = None
    max_vega: Optional[float] = None

    # IV & Time
    min_iv: Optional[float] = None
    max_iv: Optional[float] = None
    min_dte: Optional[int] = None
    max_dte: Optional[int] = None

    # Option type
    option_type: Optional[str] = None  # "call", "put", or None

    # Strike & Price
    min_strike: Optional[float] = None
    max_strike: Optional[float] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


