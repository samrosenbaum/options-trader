from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field, field_validator, ConfigDict


class OptionGreeks(BaseModel):
    """Normalized representation of option Greeks."""

    delta: float = 0.0
    gamma: float = 0.0
    theta: float = 0.0
    vega: float = 0.0


class OptionContract(BaseModel):
    """Structured view of an option contract used by the scoring engine."""

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True
    )

    symbol: str
    option_type: Literal["call", "put"] = Field(alias="type")
    strike: float
    expiration: date
    last_price: float = Field(alias="lastPrice")
    bid: float
    ask: float
    volume: int
    open_interest: int = Field(alias="openInterest")
    implied_volatility: float = Field(alias="impliedVolatility")
    stock_price: float = Field(alias="stockPrice")
    greeks: OptionGreeks = Field(default_factory=OptionGreeks)
    raw: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("expiration", mode="before")
    @classmethod
    def parse_expiration(cls, value: Any) -> date:
        if isinstance(value, date):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            return datetime.strptime(value, "%Y-%m-%d").date()
        raise ValueError("Unsupported expiration format")

    @field_validator("volume", "open_interest", mode="before")
    @classmethod
    def coerce_int(cls, value: Any) -> int:
        return int(value or 0)

    @field_validator("implied_volatility", "last_price", "bid", "ask", "stock_price", "strike", mode="before")
    @classmethod
    def coerce_float(cls, value: Any) -> float:
        return float(value or 0.0)

    @property
    def mid_price(self) -> float:
        return round((self.bid + self.ask) / 2, 4) if self.bid or self.ask else self.last_price

    @property
    def days_to_expiration(self) -> int:
        return (self.expiration - date.today()).days


class ScoreBreakdown(BaseModel):
    scorer: str
    weight: float
    raw_score: float
    weighted_score: float
    reasons: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class OptionScore(BaseModel):
    total_score: float
    breakdowns: List[ScoreBreakdown] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @property
    def confidence(self) -> float:
        # Derive a loose confidence metric based on score distribution.
        if not self.breakdowns:
            return min(100.0, max(0.0, self.total_score))
        positive = sum(b.weighted_score for b in self.breakdowns if b.weighted_score > 0)
        negative = -sum(b.weighted_score for b in self.breakdowns if b.weighted_score < 0)
        base = self.total_score if self.total_score > 0 else 0.0
        confidence = base + positive * 0.2 - negative * 0.1
        return float(max(0.0, min(100.0, confidence)))


class ScoringResult(BaseModel):
    contract: OptionContract
    greeks: OptionGreeks
    score: OptionScore

