from __future__ import annotations

from datetime import datetime
from typing import Dict, List

from pydantic import BaseModel, Field

from .option import OptionContract, OptionScore, OptionGreeks, ScoringResult


class Signal(BaseModel):
    """Structured trading signal produced by the scoring engine."""

    symbol: str
    contract: OptionContract
    greeks: OptionGreeks
    score: OptionScore
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
            reasons=result.score.reasons,
            tags=result.score.tags,
            metadata=metadata or result.score.metadata,
        )

