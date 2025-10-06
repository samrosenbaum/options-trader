from __future__ import annotations

from typing import Dict, List, Type

from src.models.option import OptionContract, OptionGreeks, OptionScore, ScoringResult, ScoreBreakdown

from .base import ScoreContext
from .config import merge_config
from .gamma_squeeze import GammaSqueezeScorer
from .iv_anomaly import IVAnomalyScorer
from .iv_rank import IVRankScorer
from .liquidity import LiquidityScorer
from .risk_reward import RiskRewardScorer
from .volume import VolumeScorer

SCORER_REGISTRY = {
    VolumeScorer.key: VolumeScorer,
    GammaSqueezeScorer.key: GammaSqueezeScorer,
    IVAnomalyScorer.key: IVAnomalyScorer,
    IVRankScorer.key: IVRankScorer,
    LiquidityScorer.key: LiquidityScorer,
    RiskRewardScorer.key: RiskRewardScorer,
}


class CompositeScoringEngine:
    """Aggregates scores from enabled scorers using configured weights."""

    def __init__(self, config: Dict[str, object] | None = None):
        self.config = merge_config(config)
        enabled = self.config.get("enabled", list(SCORER_REGISTRY))
        self._scorers = [self._instantiate(key) for key in enabled if key in SCORER_REGISTRY]

    def _instantiate(self, key: str):
        scorer_cls: Type = SCORER_REGISTRY[key]
        return scorer_cls()

    def score(
        self,
        contract: OptionContract,
        greeks: OptionGreeks,
        market_data: Dict[str, float] | None = None,
    ) -> ScoringResult:
        market_snapshot = dict(market_data or {})
        context = ScoreContext(contract=contract, greeks=greeks, market_data=market_snapshot, config=self.config)

        breakdowns: List[ScoreBreakdown] = []
        total = 0.0
        all_reasons: List[str] = []
        all_tags: List[str] = []

        for scorer in self._scorers:
            raw_score, reasons, tags = scorer.score(context)
            weight = context.get_weight(scorer.key, getattr(scorer, "default_weight", 1.0))
            weighted_score = raw_score * weight
            total += weighted_score
            breakdowns.append(
                ScoreBreakdown(
                    scorer=scorer.key,
                    weight=weight,
                    raw_score=raw_score,
                    weighted_score=weighted_score,
                    reasons=reasons,
                    tags=tags,
                )
            )
            all_reasons.extend(reasons)
            all_tags.extend(tags)

        bounds = self.config.get("score_bounds", {})
        min_score = float(bounds.get("min", 0.0))
        max_score = float(bounds.get("max", 100.0))
        total = max(min_score, min(max_score, total))

        score = OptionScore(
            total_score=round(total, 2),
            breakdowns=breakdowns,
            reasons=all_reasons,
            tags=sorted(set(all_tags)),
            metadata={"market_data": market_snapshot},
        )
        return ScoringResult(contract=contract, greeks=greeks, score=score)

    @property
    def enabled_scorers(self) -> List[str]:
        return [scorer.key for scorer in self._scorers]


__all__ = ["CompositeScoringEngine", "SCORER_REGISTRY"]

