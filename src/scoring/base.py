from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Protocol, Tuple

from src.models.option import OptionContract, OptionGreeks


@dataclass(frozen=True)
class ScoreContext:
    """Information passed to each scorer."""

    contract: OptionContract
    greeks: OptionGreeks
    market_data: Dict[str, float]
    config: Dict[str, object]

    def get_weight(self, scorer_key: str, default: float) -> float:
        return float(self.config.get("weights", {}).get(scorer_key, default))


class OptionScorer(Protocol):
    """Protocol each scoring component must implement."""

    key: str
    default_weight: float

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        """Return raw score, reasoning strings, and tags."""

