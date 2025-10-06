from __future__ import annotations

from typing import Dict

DEFAULT_SCORER_CONFIG: Dict[str, object] = {
    "enabled": [
        "volume",
        "iv_rank",
        "liquidity",
        "risk_reward",
    ],
    "weights": {
        "volume": 1.0,
        "iv_rank": 1.2,
        "liquidity": 0.8,
        "risk_reward": 1.5,
    },
    "score_bounds": {
        "min": 0.0,
        "max": 100.0,
    },
}


def merge_config(overrides: Dict[str, object] | None) -> Dict[str, object]:
    if not overrides:
        return dict(DEFAULT_SCORER_CONFIG)
    merged = dict(DEFAULT_SCORER_CONFIG)
    if "enabled" in merged:
        merged["enabled"] = list(DEFAULT_SCORER_CONFIG.get("enabled", ()))
    merged_weights = dict(DEFAULT_SCORER_CONFIG.get("weights", {}))
    if "score_bounds" in merged:
        merged["score_bounds"] = dict(DEFAULT_SCORER_CONFIG.get("score_bounds", {}))
    if "weights" in overrides:
        merged_weights.update(overrides["weights"])
    merged["weights"] = merged_weights
    if "enabled" in overrides:
        merged["enabled"] = overrides["enabled"]
    if "score_bounds" in overrides:
        merged["score_bounds"] = {
            **DEFAULT_SCORER_CONFIG.get("score_bounds", {}),
            **overrides["score_bounds"],
        }
    for key, value in overrides.items():
        if key not in {"weights", "enabled", "score_bounds"}:
            merged[key] = value
    return merged

