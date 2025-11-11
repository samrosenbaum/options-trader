"""Catalyst tracker that aggregates upcoming events and technical context."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

from pydantic import BaseModel, Field

from src.analyst.nightly_brief import analyze_key_levels
from src.scanner.earnings_calendar import get_earnings_dates


@dataclass
class _MacroEvent:
    name: str
    date: datetime
    description: Optional[str] = None
    impact: str = "medium"
    tags: List[str] = None

    def to_payload(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "date": self.date,
            "description": self.description,
            "impact": self.impact,
            "tags": list(self.tags or []),
            "type": "macro",
            "source": "macro_calendar",
        }


@dataclass
class _CompanyEvent:
    name: str
    date: Optional[datetime]
    event_type: str
    description: Optional[str] = None
    impact: str = "medium"
    confidence: float = 0.5
    source: str = "company_events"
    tags: List[str] = None
    approximate: bool = False

    def to_payload(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "date": self.date,
            "type": self.event_type,
            "description": self.description,
            "impact": self.impact,
            "confidence": self.confidence,
            "source": self.source,
            "tags": list(self.tags or []),
            "approximate": self.approximate,
        }


class CatalystEvent(BaseModel):
    """Canonical representation of an upcoming catalyst."""

    type: str
    name: str
    date: Optional[datetime] = None
    days_until: Optional[float] = None
    description: Optional[str] = None
    impact: str = "medium"
    confidence: float = 0.5
    source: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    approximate: bool = False


class TechnicalInsight(BaseModel):
    """Summarises near-term technical posture for the underlying."""

    trend: Optional[str] = None
    support: Optional[float] = None
    resistance: Optional[float] = None
    last_price: Optional[float] = None
    support_distance_pct: Optional[float] = None
    resistance_distance_pct: Optional[float] = None
    moving_averages: Dict[str, Optional[float]] = Field(default_factory=dict)
    commentary: List[str] = Field(default_factory=list)


class CatalystSummary(BaseModel):
    """Aggregate catalyst view for a single symbol."""

    symbol: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    events: List[CatalystEvent] = Field(default_factory=list)
    technical: Optional[TechnicalInsight] = None


class CatalystTracker:
    """Collects and normalises catalyst data for a symbol."""

    _DEFAULT_LOOKAHEAD_DAYS = 30

    def __init__(
        self,
        *,
        earnings_fetcher: Callable[[List[str]], Mapping[str, Optional[datetime]]] = get_earnings_dates,
        technical_analyzer: Callable[[str], Mapping[str, Any]] = analyze_key_levels,
        macro_events: Optional[Iterable[Mapping[str, Any]]] = None,
        company_events: Optional[Mapping[str, Iterable[Mapping[str, Any]]]] = None,
        now_factory: Callable[[], datetime] = datetime.utcnow,
        macro_events_path: Optional[Path] = None,
        company_events_path: Optional[Path] = None,
        lookahead_days: int = _DEFAULT_LOOKAHEAD_DAYS,
    ) -> None:
        self._earnings_fetcher = earnings_fetcher
        self._technical_analyzer = technical_analyzer
        self._now_factory = now_factory
        self._lookahead = max(1, lookahead_days)
        self._macro_events = (
            list(self._normalise_macro_events(macro_events))
            if macro_events is not None
            else list(self._load_macro_events(macro_events_path))
        )
        self._company_events = (
            {symbol.upper(): list(events) for symbol, events in company_events.items()}
            if company_events is not None
            else self._load_company_events(company_events_path)
        )

    def build_summary(self, symbol: str) -> CatalystSummary:
        """Return catalysts and technical context for ``symbol``."""

        symbol = symbol.upper()
        now = self._now_factory()
        events: List[CatalystEvent] = []

        earnings_date = self._fetch_earnings_date(symbol)
        if earnings_date:
            days_until = self._days_until(now, earnings_date)
            if days_until is None or days_until >= -2:  # Include recent post-earnings moves
                impact = "high" if days_until is not None and days_until <= 7 else "medium"
                events.append(
                    CatalystEvent(
                        type="earnings",
                        name="Earnings report",
                        date=earnings_date,
                        days_until=days_until,
                        description="Upcoming quarterly results",
                        impact=impact,
                        confidence=0.9,
                        source="earnings_calendar",
                        tags=["volatility"],
                    )
                )

        events.extend(self._build_company_events(symbol, now))
        events.extend(self._build_macro_events(now))

        events = self._sort_events(events)

        technical = self._build_technical_snapshot(symbol)

        return CatalystSummary(symbol=symbol, events=events, technical=technical)

    # ------------------------------------------------------------------
    # Earnings helpers
    # ------------------------------------------------------------------
    def _fetch_earnings_date(self, symbol: str) -> Optional[datetime]:
        try:
            results = self._earnings_fetcher([symbol])
        except Exception:
            return None
        if not results:
            return None
        date = results.get(symbol)
        if isinstance(date, datetime):
            return date
        return None

    # ------------------------------------------------------------------
    # Macro events
    # ------------------------------------------------------------------
    def _load_macro_events(self, override_path: Optional[Path]) -> Iterable[_MacroEvent]:
        path = override_path or self._default_data_path("macro_events.json")
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            return []
        return self._normalise_macro_events(data)

    def _normalise_macro_events(self, raw_events: Iterable[Mapping[str, Any]]) -> Iterable[_MacroEvent]:
        for event in raw_events or []:
            date = self._parse_datetime(event.get("date"))
            if not date:
                continue
            yield _MacroEvent(
                name=str(event.get("name", "Macro Event")),
                date=date,
                description=event.get("description"),
                impact=str(event.get("impact", "medium")),
                tags=list(event.get("tags", [])),
            )

    def _build_macro_events(self, now: datetime) -> List[CatalystEvent]:
        events: List[CatalystEvent] = []
        for event in self._macro_events:
            days_until = self._days_until(now, event.date)
            if days_until is None:
                continue
            if days_until < -1 or days_until > self._lookahead:
                continue
            payload = event.to_payload()
            events.append(
                CatalystEvent(
                    type=payload["type"],
                    name=payload["name"],
                    date=payload["date"],
                    days_until=days_until,
                    description=payload.get("description"),
                    impact=payload.get("impact", "medium"),
                    confidence=0.6,
                    source=payload.get("source"),
                    tags=list(payload.get("tags", [])),
                )
            )
        return events

    # ------------------------------------------------------------------
    # Company specific events
    # ------------------------------------------------------------------
    def _load_company_events(self, override_path: Optional[Path]) -> Dict[str, List[Mapping[str, Any]]]:
        path = override_path or self._default_data_path("company_events.json")
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            return {}
        normalised: Dict[str, List[Mapping[str, Any]]] = {}
        for symbol, events in data.items():
            if not isinstance(events, list):
                continue
            normalised[symbol.upper()] = events
        return normalised

    def _build_company_events(self, symbol: str, now: datetime) -> List[CatalystEvent]:
        events: List[CatalystEvent] = []
        raw_events = self._company_events.get(symbol, [])
        for raw in raw_events:
            resolved_date, window_days, approximate = self._resolve_company_event_date(raw, now)
            payload = _CompanyEvent(
                name=str(raw.get("name", "Company event")),
                date=resolved_date,
                event_type=str(raw.get("type", "event")),
                description=raw.get("description"),
                impact=str(raw.get("impact", "medium")),
                confidence=float(raw.get("confidence", 0.6)),
                source=str(raw.get("source", "company_events")),
                tags=list(raw.get("tags", [])),
                approximate=bool(raw.get("approximate", approximate)),
            ).to_payload()
            date = payload.get("date")
            days_until = self._days_until(now, date) if date else None
            lookahead_buffer = self._lookahead + window_days
            if days_until is not None and (days_until < -1 or days_until > lookahead_buffer):
                continue
            events.append(
                CatalystEvent(
                    type=str(payload.get("type", "event")),
                    name=payload["name"],
                    date=date,
                    days_until=days_until,
                    description=payload.get("description"),
                    impact=payload.get("impact", "medium"),
                    confidence=float(payload.get("confidence", 0.6)),
                    source=payload.get("source"),
                    tags=list(payload.get("tags", [])),
                    approximate=bool(payload.get("approximate", False)),
                )
            )
        return events

    def _resolve_company_event_date(
        self, raw: Mapping[str, Any], now: datetime
    ) -> tuple[Optional[datetime], float, bool]:
        """Resolve the canonical date for a company event.

        Returns a tuple of ``(date, window_days, approximate)``. ``window_days``
        is used to widen the lookahead horizon for events that have an
        approximate timing window (e.g. product launches that move around by a
        week). ``approximate`` indicates that the returned date is derived from
        heuristics rather than an explicit timestamp in the source payload.
        """

        explicit_date = self._parse_datetime(raw.get("date"))
        if explicit_date:
            return explicit_date, 0.0, bool(raw.get("approximate", False))

        recurrence = raw.get("recurrence") or {}
        month = recurrence.get("month")
        day = recurrence.get("day")
        if month is None or day is None:
            return None, 0.0, False

        hour = int(recurrence.get("hour", 13))
        minute = int(recurrence.get("minute", 0))
        try:
            window_days = float(recurrence.get("window_days", recurrence.get("windowDays", 0)))
        except (TypeError, ValueError):
            window_days = 0.0
        approximate = bool(recurrence.get("approximate", True))

        tzinfo = now.tzinfo

        try:
            candidate = datetime(now.year, int(month), int(day), hour, minute, tzinfo=tzinfo)
        except ValueError:
            return None, 0.0, approximate

        if candidate < now:
            try:
                candidate = datetime(now.year + 1, int(month), int(day), hour, minute, tzinfo=tzinfo)
            except ValueError:
                return None, 0.0, approximate

        return candidate, window_days, approximate

    # ------------------------------------------------------------------
    # Technical context
    # ------------------------------------------------------------------
    def _build_technical_snapshot(self, symbol: str) -> Optional[TechnicalInsight]:
        try:
            raw = self._technical_analyzer(symbol)
        except Exception:
            raw = None
        if not raw:
            return None

        price = self._safe_float(raw.get("current_price"))
        support = self._safe_float(raw.get("support"))
        resistance = self._safe_float(raw.get("resistance"))
        ma20 = self._safe_float(raw.get("ma20"))
        ma50 = self._safe_float(raw.get("ma50"))

        support_distance_pct = self._distance_pct(price, support)
        resistance_distance_pct = self._distance_pct(resistance, price) if price and resistance else None

        commentary: List[str] = []
        if price and support:
            if price < support:
                commentary.append(f"Below key support at ${support:.2f}")
            elif support_distance_pct is not None and support_distance_pct <= 3:
                commentary.append(
                    f"Price sitting {support_distance_pct:.1f}% above support (${support:.2f})"
                )
        if price and resistance:
            if price > resistance:
                commentary.append(f"Clearing resistance at ${resistance:.2f} – breakout watch")
            elif resistance_distance_pct is not None and resistance_distance_pct <= 3:
                commentary.append(
                    f"Within {resistance_distance_pct:.1f}% of resistance (${resistance:.2f})"
                )

        if price and ma20 and ma50:
            if price > ma20 > ma50:
                commentary.append("Trend alignment: price > 20d > 50d (bullish momentum)")
            elif price < ma20 < ma50:
                commentary.append("Downtrend: price < 20d < 50d (bearish pressure)")

        if not commentary and price and ma20:
            commentary.append(
                f"Trading {'above' if price > ma20 else 'near'} the 20-day average (${ma20:.2f})"
            )

        return TechnicalInsight(
            trend=raw.get("trend"),
            support=support,
            resistance=resistance,
            last_price=price,
            support_distance_pct=support_distance_pct,
            resistance_distance_pct=resistance_distance_pct,
            moving_averages={"ma20": ma20, "ma50": ma50},
            commentary=commentary,
        )

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------
    def _sort_events(self, events: List[CatalystEvent]) -> List[CatalystEvent]:
        type_priority = {"earnings": 0, "company": 1, "macro": 2}
        source_priority = {"company_events": 1, "macro_calendar": 2}

        def sort_key(event: CatalystEvent) -> tuple[float, float, datetime]:
            priority = type_priority.get(event.type, source_priority.get(event.source or "", 99))
            days_until = float("inf") if event.days_until is None else event.days_until
            event_date = event.date or datetime.max
            return (priority, days_until, event_date)

        return sorted(events, key=sort_key)

    def _days_until(self, now: datetime, event_date: Optional[datetime]) -> Optional[float]:
        if not event_date:
            return None
        delta = event_date - now
        return delta.total_seconds() / 86400.0

    def _distance_pct(self, reference: Optional[float], level: Optional[float]) -> Optional[float]:
        if not reference or not level:
            return None
        if reference == 0:
            return None
        return (reference - level) / reference * 100.0

    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None

    def _default_data_path(self, filename: str) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / filename

    def _safe_float(self, value: Any) -> Optional[float]:
        try:
            if value is None:
                return None
            parsed = float(value)
            if parsed != parsed or parsed in {float("inf"), float("-inf")}:
                return None
            return parsed
        except (TypeError, ValueError):
            return None


__all__ = ["CatalystTracker", "CatalystSummary", "CatalystEvent", "TechnicalInsight"]
