# Directional Indicator Architecture Review

## Executive Summary
The platform runs two layers of directional logic:

1. **Legacy bias scoring** inside `SmartOptionsScanner.calculate_directional_bias`, which
   combines momentum, sentiment, volatility, market context, moneyness, and Greeks into a
   deterministic bull/bear/neutral call for the specific option contract.
2. **Enhanced multi-signal engine** in `calculate_enhanced_directional_bias`, which pushes
   symbol-level data through a `SignalAggregator` spanning options skew, institutional flow,
   regime detection, and volume profile analytics. The aggregator outputs a unified score,
   confidence, and recommendation that also flows back into contract-level alignment checks.

Both systems are additive: the enhanced signal guides preferred contract type, while the legacy
score still enriches the user narrative and highlights contract-specific risks.

## Data Flow Overview

1. **Signal initialization** – Scanner boots with a weighted mix of four institutional-grade
   signals (30% skew, 30% smart money flow, 20% regime, 20% volume profile).【F:src/scanner/service.py†L77-L83】
2. **Enhanced bias pass** – For each symbol the scanner fetches the current option, constructs a
   pseudo-historical volume baseline, downloads 30 days of price history from Yahoo Finance, and
   hands the data to the aggregator. The aggregator returns a normalized direction, score, and
   per-signal breakdown.【F:src/scanner/service.py†L745-L825】
3. **Legacy bias pass** – The same option then runs through rule-based scoring that focuses on
   swing factors, sentiment, contract positioning, and Greeks to ensure contract-level alignment
   with the broader directional view.【F:src/scanner/service.py†L831-L1136】

This dual-stage flow mirrors discretionary institutional workflows: a top-down market regime and
flow read, followed by bottom-up instrument selection.

## Legacy Directional Bias Mechanics
The legacy engine is explicitly rule-driven and uses additive bull/bear points with a final net
score to classify bias:

- **Swing momentum dominates** – `Momentum Breakout` z-scores add ±30 or ±15 points when price
  accelerates; neutral outcomes leave momentum commentary only.【F:src/scanner/service.py†L846-L901】
- **News sentiment** – Aggregated NLP scores add ±20/±10 points, capturing event-driven drift.【F:src/scanner/service.py†L902-L952】
- **Volatility context** – ATR expansion is descriptive only, reinforcing conviction without
  altering the numerical bias.【F:src/scanner/service.py†L954-L989】
- **Market regime overlay** – Macro backdrop from swing analysis shapes narrative support for
  calls vs puts.【F:src/scanner/service.py†L990-L1019】
- **Contract structure** – Moneyness tagging and delta-based commentary highlight execution risk
  and responsiveness, but do not move the bull/bear tally.【F:src/scanner/service.py†L1021-L1089】
- **Decision rule** – Net score thresholds (>20 bullish, <−20 bearish) map to direction and scale
  the confidence metric, which is otherwise anchored at 50%.【F:src/scanner/service.py†L1092-L1136】

This approach offers clarity but behaves like an expert system: deterministic thresholds, fixed
weights, and no calibration to realized hit rates. It excels at explainability and aligns with how
an options desk would articulate trade narratives, yet it risks overstating conviction when signals
correlate (e.g., momentum and sentiment both reacting to the same catalyst).

## Enhanced Multi-Signal Engine
The enhanced path attempts to approximate the “quant overlay” an institutional trader would run
before sizing risk:

- **Signal orchestration** – `SignalAggregator` iterates through each signal, substitutes neutral
  stubs on missing data, and captures errors without halting the run.【F:src/signals/signal_aggregator.py†L36-L82】
- **Weighted scoring** – Only signals with confidence above 10 feed the weighted average. Each
  contribution is scaled by configured weight × (confidence ÷ 100), so weak or noisy readings have
  little influence.【F:src/signals/signal_aggregator.py†L99-L121】
- **Confidence synthesis** – The aggregator blends directional agreement, average signal
  confidence, and diversification to cap composite conviction at 95%. Disagreement triggers an
  explicit penalty, reducing overconfidence when flows conflict.【F:src/signals/signal_aggregator.py†L123-L165】
- **Recommendation logic** – Final messaging ties confidence bands to actionable guidance (favor
  calls vs puts, or stand aside if neutral).【F:src/signals/signal_aggregator.py†L166-L192】

This framework is structurally sound, but several data shortcuts (e.g., proxying historical volume
by scaling current prints, single-interval price history) can inject noise and lower confidence in
volatile regimes.【F:src/scanner/service.py†L767-L808】

## Signal-Level Insights

### Options Skew (30% Weight)
- Focuses on 5–15% OTM strikes, computes put/call skew, and risk reversals as institutional desks
  would when reading dealer positioning.【F:src/signals/options_skew.py†L84-L147】
- Converts skew spread into a −100 to +100 score (put skew bearish, call skew bullish) and boosts
  confidence when skew magnitudes or risk reversals are extreme.【F:src/signals/options_skew.py†L155-L199】
- Currently lacks historical normalization beyond the ATM baseline; intraday skews can be regime-
  specific and benefit from percentile ranks vs the ticker’s own history.

### Smart Money Flow (30% Weight)
- Aggregates unusual volume z-scores, call/put ratios, bid/ask aggression, block trades, and price
  confirmation into a composite net flow score meant to mimic tape-reading of institutional flow.【F:src/signals/smart_money_flow.py†L84-L169】
- Relies on synthetic historical averages (current volume × 0.7) when true baselines are absent,
  which can overstate unusual activity during event-driven surges.【F:src/scanner/service.py†L767-L779】【F:src/signals/smart_money_flow.py†L117-L123】
- Would benefit from richer data (e.g., historical volume slices, time-of-day adjustments) to avoid
  false positives.

### Regime Detection (20% Weight)
- Computes ADX, DI±, Bollinger width percentiles, regression slope, and classifies regimes such as
  trending, transitioning, or consolidation, then maps them to directional scores and narratives.【F:src/signals/regime_detection.py†L150-L343】
- Provides a disciplined macro overlay akin to quant regime models, but depends on a 30-day window
  from Yahoo Finance; missing data or corporate actions can skew ADX and slope readings.【F:src/scanner/service.py†L781-L799】

### Volume Profile (20% Weight)
- Builds a histogram of recent price/volume, extracts point of control and value area, then gauges
  whether current price is accepting above/below volume nodes to infer breakout or mean reversion
  bias.【F:src/signals/volume_profile.py†L86-L205】
- Confidence stems from structural context rather than statistical backtests; additional features
  such as volume-at-price trend or session-based profiles could sharpen signals.

## Institutional-Grade Observations & Recommendations

1. **Calibrate with realized performance** – Neither engine currently feeds back accuracy to adjust
   weights or thresholds. Logging outcomes and fitting a Bayesian or logistic calibration would
   turn heuristic confidence into empirically grounded conviction (e.g., adjust weights by hit
   rate, similar to what the `Signal` base class anticipates).【F:src/signals/base.py†L52-L82】
2. **Improve data fidelity** – Replace synthetic historical volume assumptions with true rolling
   averages and standard deviations, ideally segmented by time-of-day, to stabilize the smart money
   detector. Integrating a local cache of historical option volume would align with how desks use
   vendor feeds.【F:src/scanner/service.py†L767-L808】【F:src/signals/smart_money_flow.py†L117-L169】
3. **Normalize signals cross-sectionally** – Transform skew, flow, and regime metrics into z-scores
   or percentile ranks versus each ticker’s own history before weighting. This reduces structural
   bias (e.g., tech names with chronic put skew) and brings the system closer to risk-neutral
   pricing diagnostics.【F:src/signals/options_skew.py†L84-L199】
4. **Incorporate correlation awareness** – Momentum, news, and smart flow can be highly correlated
   around catalysts. Introducing a covariance-aware adjustment (or simply limiting incremental
   weight when multiple signals hinge on the same underlying move) would avoid double-counting.
5. **Scenario stress testing** – Capture signal states during known historical events (earnings,
   macro shocks) to validate whether the combined score led or lagged the actual move. This audit
   mirrors institutional “playbook” building and will surface blind spots such as regime shifts that
   occur faster than the 30-day window can adapt.
6. **Expand confidence messaging** – Use the aggregator’s disagreement penalty to drive automated
   “conflict alerts” in the UI, guiding traders to reduce size when signals diverge—emulating how
   risk committees flag incongruent indicators.【F:src/signals/signal_aggregator.py†L123-L165】

By layering empirical calibration, richer data, and correlation controls on top of the current
structure, the directional indicator can graduate from a strong narrative guide to an institutional-
caliber decision engine that withstands regime volatility and supports systematic trade sizing.
