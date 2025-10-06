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


