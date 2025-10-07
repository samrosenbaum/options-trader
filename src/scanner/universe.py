"""Helpers for constructing rotating symbol universes for scans."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Tuple

from scripts.bulk_options_fetcher import BulkOptionsFetcher
from src.config.loader import AppSettings

DEFAULT_STATE_FILE = Path("data/scan_universe_state.json")


@dataclass
class UniverseRotationState:
    """Serializable container describing the scan universe rotation state."""

    mode: str = "round_robin"
    position: int = 0
    order: List[str] = field(default_factory=list)
    seed: int | None = None

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any] | None) -> "UniverseRotationState":
        if not payload:
            return cls()
        mode = str(payload.get("mode", "round_robin") or "round_robin").lower().strip()
        position = int(payload.get("position", 0) or 0)
        order = [str(sym).upper().strip() for sym in payload.get("order", []) if sym]
        seed_value = payload.get("seed")
        try:
            seed = int(seed_value) if seed_value is not None else None
        except (TypeError, ValueError):
            seed = None
        return cls(mode=mode, position=max(position, 0), order=order, seed=seed)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "position": self.position,
            "order": list(self.order),
            "seed": self.seed,
        }


def _state_file_from_settings(settings: AppSettings) -> Path:
    try:
        sqlite_settings = settings.storage.require_sqlite()
        sqlite_path = Path(sqlite_settings.path)
        if sqlite_path.name != ":memory:":
            base_dir = sqlite_path if sqlite_path.is_dir() else sqlite_path.parent
            if base_dir.exists():
                return base_dir / DEFAULT_STATE_FILE.name
    except Exception:
        pass
    return DEFAULT_STATE_FILE


def _load_persisted_state(path: Path) -> Mapping[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}


def _persist_state(path: Path, state: Mapping[str, Any]) -> None:
    if path.name != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(dict(state), handle, indent=2)


def _normalise_universe(symbols: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    cleaned: List[str] = []
    for symbol in symbols:
        normalized = str(symbol).upper().strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized)
    return cleaned


def _prepare_round_robin(state: UniverseRotationState, universe: List[str]) -> UniverseRotationState:
    if not state.order:
        state.order = list(universe)
        state.position = 0
        return state

    filtered = [symbol for symbol in state.order if symbol in universe]
    additions = [symbol for symbol in universe if symbol not in filtered]
    state.order = filtered + additions
    if state.position >= len(state.order):
        state.position = 0
    return state


def _prepare_random(state: UniverseRotationState, universe: List[str]) -> UniverseRotationState:
    rng = random.Random(state.seed)
    if not state.order or set(state.order) != set(universe):
        state.order = list(universe)
        rng.shuffle(state.order)
        if state.seed is None:
            state.seed = random.randint(1, 1_000_000)
            rng = random.Random(state.seed)
            rng.shuffle(state.order)
        state.position = 0
        return state

    if state.position >= len(state.order):
        state.position = 0
    return state


def _next_batch(order: List[str], position: int, batch_size: int) -> Tuple[List[str], int]:
    if not order:
        return [], 0

    if batch_size <= 0:
        return [], position % len(order)

    total = len(order)
    start = position % total
    end = start + batch_size
    if batch_size >= total:
        batch = list(order)
        new_position = end % total
    elif end <= total:
        batch = order[start:end]
        new_position = end % total
    else:
        wrap = end % total
        batch = order[start:] + order[:wrap]
        new_position = wrap
    return batch, new_position


def build_scan_universe(
    settings: AppSettings,
    batch_size: int,
    rotation_state: Mapping[str, Any] | None,
) -> Tuple[List[str], Dict[str, Any]]:
    """Return the next batch of symbols to scan and an updated rotation state."""

    state_path = _state_file_from_settings(settings)
    persisted_state = _load_persisted_state(state_path)
    merged_state: MutableMapping[str, Any] = dict(persisted_state)
    if rotation_state:
        merged_state.update(rotation_state)

    state = UniverseRotationState.from_mapping(merged_state)
    if state.mode not in {"round_robin", "random"}:
        state.mode = "round_robin"

    fetcher = BulkOptionsFetcher(settings)
    universe = _normalise_universe(fetcher.priority_symbols)

    if not universe:
        state.order = []
        state.position = 0
        _persist_state(state_path, state.to_dict())
        return [], state.to_dict()

    if state.mode == "random":
        state = _prepare_random(state, universe)
    else:
        state = _prepare_round_robin(state, universe)

    batch, new_position = _next_batch(state.order, state.position, batch_size)
    state.position = new_position

    if state.mode == "random" and state.order and new_position == 0:
        rng = random.Random(state.seed or random.randint(1, 1_000_000))
        rng.shuffle(state.order)

    payload = state.to_dict()
    _persist_state(state_path, payload)

    return batch, payload


__all__ = ["build_scan_universe", "UniverseRotationState"]

