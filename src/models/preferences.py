"""Scanner preference schema and Supabase persistence helpers."""

from __future__ import annotations

import copy
import hashlib
import json
import os
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Mapping, Optional, Tuple


def _coerce_float(value: Any) -> Optional[float]:
    """Best-effort conversion of user-provided values to float."""

    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    """Best-effort conversion of user-provided values to int."""

    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


@dataclass
class RangeBand:
    """Represents a numeric min/max range."""

    minimum: float
    maximum: float
    clamp_min: float
    clamp_max: float
    default_min: float
    default_max: float
    name: str = field(repr=False, default="band")

    def clamp(self) -> Iterable[str]:
        """Clamp the range within configured safety bounds."""

        notices: list[str] = []
        if self.minimum < self.clamp_min:
            notices.append(f"{self.name}.min raised to {self.clamp_min}")
            self.minimum = self.clamp_min
        if self.maximum > self.clamp_max:
            notices.append(f"{self.name}.max lowered to {self.clamp_max}")
            self.maximum = self.clamp_max
        if self.minimum > self.maximum:
            notices.append(f"{self.name}.min exceeded max; resetting to defaults")
            self.minimum = self.default_min
            self.maximum = self.default_max
        return notices

    def to_record(self, prefix: str) -> Dict[str, float]:
        return {
            f"{prefix}_min": float(self.minimum),
            f"{prefix}_max": float(self.maximum),
        }

    def to_dict(self) -> Dict[str, float]:
        return {"min": float(self.minimum), "max": float(self.maximum)}

    def copy(self, *, minimum: Optional[float] = None, maximum: Optional[float] = None) -> "RangeBand":
        return replace(
            self,
            minimum=self.minimum if minimum is None else minimum,
            maximum=self.maximum if maximum is None else maximum,
        )


@dataclass
class VolumePreference:
    """Volume and open-interest requirements."""

    min_contracts: int
    min_open_interest: int
    min_volume_to_oi: float
    max_contracts: Optional[int]
    clamp_min_contracts: int = field(repr=False, default=0)
    clamp_max_contracts: int = field(repr=False, default=1_000_000)
    clamp_min_ratio: float = field(repr=False, default=0.0)
    clamp_max_ratio: float = field(repr=False, default=50.0)

    def clamp(self) -> Iterable[str]:
        notices: list[str] = []
        if self.min_contracts < self.clamp_min_contracts:
            self.min_contracts = self.clamp_min_contracts
            notices.append("volume.minContracts raised to safety floor")
        if self.max_contracts is not None and self.max_contracts > self.clamp_max_contracts:
            self.max_contracts = self.clamp_max_contracts
            notices.append("volume.maxContracts lowered to safety ceiling")
        if self.min_contracts > (self.max_contracts or self.clamp_max_contracts):
            notices.append("volume.minContracts exceeded maxContracts; resetting to defaults")
            self.min_contracts = 100
            self.max_contracts = None
        if self.min_open_interest < 0:
            self.min_open_interest = 0
            notices.append("volume.minOpenInterest raised to zero")
        if self.min_volume_to_oi < self.clamp_min_ratio:
            self.min_volume_to_oi = self.clamp_min_ratio
            notices.append("volume.minVolumeToOi raised to zero")
        if self.min_volume_to_oi > self.clamp_max_ratio:
            self.min_volume_to_oi = self.clamp_max_ratio
            notices.append("volume.minVolumeToOi lowered to safety ceiling")
        return notices

    def to_record(self) -> Dict[str, Any]:
        return {
            "volume_min": int(self.min_contracts),
            "volume_max": int(self.max_contracts) if self.max_contracts is not None else None,
            "min_open_interest": int(self.min_open_interest),
            "volume_ratio_min": float(self.min_volume_to_oi),
        }

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "minContracts": int(self.min_contracts),
            "minOpenInterest": int(self.min_open_interest),
            "minVolumeToOi": float(self.min_volume_to_oi),
        }
        if self.max_contracts is not None:
            payload["maxContracts"] = int(self.max_contracts)
        return payload

    def copy(self) -> "VolumePreference":
        return copy.deepcopy(self)


@dataclass
class DteWindow:
    """Days-to-expiration window."""

    minimum: int
    maximum: int
    clamp_min: int = field(repr=False, default=0)
    clamp_max: int = field(repr=False, default=365)

    def clamp(self) -> Iterable[str]:
        notices: list[str] = []
        if self.minimum < self.clamp_min:
            self.minimum = self.clamp_min
            notices.append("dte.minDays raised to safety floor")
        if self.maximum > self.clamp_max:
            self.maximum = self.clamp_max
            notices.append("dte.maxDays lowered to safety ceiling")
        if self.minimum > self.maximum:
            notices.append("dte.minDays exceeded maxDays; resetting to defaults")
            self.minimum = 7
            self.maximum = 120
        return notices

    def to_record(self) -> Dict[str, int]:
        return {
            "dte_min": int(self.minimum),
            "dte_max": int(self.maximum),
        }

    def to_dict(self) -> Dict[str, int]:
        return {"min": int(self.minimum), "max": int(self.maximum)}

    def copy(self) -> "DteWindow":
        return replace(self)


@dataclass
class ScannerPreference:
    """User or house scanning preferences."""

    volume: VolumePreference
    delta: RangeBand
    vega: RangeBand
    iv_rank: RangeBand
    dte: DteWindow

    @classmethod
    def institutional_default(cls) -> "ScannerPreference":
        """Default institutional preset used by the house scanner."""

        return cls(
            volume=VolumePreference(
                min_contracts=25,
                max_contracts=None,
                min_open_interest=50,
                min_volume_to_oi=0.3,
            ),
            delta=RangeBand(
                minimum=0.20,
                maximum=0.65,
                clamp_min=0.0,
                clamp_max=1.0,
                default_min=0.20,
                default_max=0.65,
                name="delta",
            ),
            vega=RangeBand(
                minimum=0.05,
                maximum=1.5,
                clamp_min=0.0,
                clamp_max=5.0,
                default_min=0.05,
                default_max=1.5,
                name="vega",
            ),
            iv_rank=RangeBand(
                minimum=30.0,
                maximum=75.0,
                clamp_min=0.0,
                clamp_max=100.0,
                default_min=30.0,
                default_max=75.0,
                name="ivRank",
            ),
            dte=DteWindow(
                minimum=14,
                maximum=120,
            ),
        )

    def copy(self) -> "ScannerPreference":
        return copy.deepcopy(self)

    def to_payload(self) -> Dict[str, Any]:
        return {
            "volume": self.volume.to_dict(),
            "delta": self.delta.to_dict(),
            "vega": self.vega.to_dict(),
            "ivRank": self.iv_rank.to_dict(),
            "dte": self.dte.to_dict(),
        }

    def to_record(self) -> Dict[str, Any]:
        record: Dict[str, Any] = {}
        record.update(self.volume.to_record())
        record.update(self.delta.to_record("delta"))
        record.update(self.vega.to_record("vega"))
        record.update(self.iv_rank.to_record("iv_rank"))
        record.update(self.dte.to_record())
        record["preference_hash"] = self.signature()
        return record

    def signature(self) -> str:
        normalized = json.dumps(self.to_payload(), sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        return digest[:16]

    def apply_overrides(self, overrides: Mapping[str, Any]) -> Iterable[str]:
        """Apply overrides to the preference, returning any safety notices."""

        if not overrides:
            return []

        notices: list[str] = []

        if "volume" in overrides and isinstance(overrides["volume"], Mapping):
            payload = overrides["volume"]
            volume = self.volume.copy()
            min_contracts = _coerce_int(payload.get("min") or payload.get("minContracts"))
            if min_contracts is not None:
                volume.min_contracts = max(min_contracts, 0)
            max_contracts = _coerce_int(payload.get("max") or payload.get("maxContracts"))
            if max_contracts is not None:
                volume.max_contracts = max(max_contracts, 1)
            min_oi = _coerce_int(payload.get("minOpenInterest"))
            if min_oi is not None:
                volume.min_open_interest = max(min_oi, 0)
            ratio = _coerce_float(payload.get("minVolumeToOi") or payload.get("volumeToOi"))
            if ratio is not None:
                volume.min_volume_to_oi = max(ratio, 0.0)
            notices.extend(volume.clamp())
            self.volume = volume

        if "delta" in overrides and isinstance(overrides["delta"], Mapping):
            payload = overrides["delta"]
            minimum = _coerce_float(payload.get("min"))
            maximum = _coerce_float(payload.get("max"))
            band = self.delta.copy(
                minimum=self.delta.minimum if minimum is None else minimum,
                maximum=self.delta.maximum if maximum is None else maximum,
            )
            notices.extend(band.clamp())
            self.delta = band

        if "vega" in overrides and isinstance(overrides["vega"], Mapping):
            payload = overrides["vega"]
            minimum = _coerce_float(payload.get("min"))
            maximum = _coerce_float(payload.get("max"))
            band = self.vega.copy(
                minimum=self.vega.minimum if minimum is None else minimum,
                maximum=self.vega.maximum if maximum is None else maximum,
            )
            notices.extend(band.clamp())
            self.vega = band

        if "ivRank" in overrides and isinstance(overrides["ivRank"], Mapping):
            payload = overrides["ivRank"]
            minimum = _coerce_float(payload.get("min"))
            maximum = _coerce_float(payload.get("max"))
            band = self.iv_rank.copy(
                minimum=self.iv_rank.minimum if minimum is None else minimum,
                maximum=self.iv_rank.maximum if maximum is None else maximum,
            )
            notices.extend(band.clamp())
            self.iv_rank = band

        if "dte" in overrides and isinstance(overrides["dte"], Mapping):
            payload = overrides["dte"]
            minimum = _coerce_int(payload.get("min"))
            maximum = _coerce_int(payload.get("max"))
            window = self.dte.copy()
            if minimum is not None:
                window.minimum = max(minimum, 0)
            if maximum is not None:
                window.maximum = max(maximum, 1)
            notices.extend(window.clamp())
            self.dte = window

        return notices

    def merge_overrides(self, overrides: Mapping[str, Any]) -> Tuple["ScannerPreference", Iterable[str]]:
        new_pref = self.copy()
        notices = list(new_pref.apply_overrides(overrides))
        return new_pref, notices

    def is_equivalent(self, other: "ScannerPreference") -> bool:
        return self.signature() == other.signature()


class PreferencePersistenceError(RuntimeError):
    """Raised when preferences cannot be persisted."""


class SupabasePreferenceStore:
    """Persist scanner preferences to Supabase."""

    def __init__(self, table: str = "scanner_preferences") -> None:
        try:
            from supabase import Client, create_client  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise PreferencePersistenceError("supabase package is required for persistence") from exc

        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if not url or not key:
            raise PreferencePersistenceError("Supabase credentials are not configured")

        self.client: Client = create_client(url, key)
        self.table = table

    def save(
        self,
        preference: ScannerPreference,
        *,
        profile: str,
        user_id: Optional[str] = None,
        label: Optional[str] = None,
        source: str = "house",
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload = preference.to_record()
        payload.update(
            {
                "profile": profile,
                "user_id": user_id,
                "label": label,
                "source": source,
                "metadata": dict(metadata or {}),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        try:
            response = self.client.table(self.table).upsert(
                payload,
                on_conflict="profile,user_id",
                returning="representation",
            ).execute()
        except Exception as exc:  # pragma: no cover - network failure
            raise PreferencePersistenceError(str(exc)) from exc

        return response.data or {}


__all__ = [
    "RangeBand",
    "VolumePreference",
    "DteWindow",
    "ScannerPreference",
    "SupabasePreferenceStore",
    "PreferencePersistenceError",
]

