# Options Trader Quantitative Overhaul Plan

## 1. Current Signal Scoring Heuristics
The live scoring engine is concentrated in a handful of rule-based scorers invoked by `CompositeScoringEngine`. The key levers and thresholds that currently drive anomaly scores are:

- **VolumeScorer** – Awards up to 35 raw points when volume/open-interest ratio exceeds 5× and never penalizes weak flow, effectively assuming higher volume is always bullish.【F:src/scoring/volume.py†L8-L27】
- **IVRankScorer** – Mixes implied-volatility rank with gamma and vega but applies fixed bumps rather than statistical context. It also blindly adds the gamma-squeeze score computed upstream, so squeeze logic is folded into IV heuristics rather than a dedicated factor.【F:src/scoring/iv_rank.py†L8-L35】
- **LiquidityScorer** – Gives 20 points for <3% spreads and >2,000 OI, making liquidity a dominant driver while simultaneously penalizing OI <500 only slightly (−5).【F:src/scoring/liquidity.py†L8-L38】
- **RiskRewardScorer** – Computes risk/reward off deterministic 10–30% underlying moves and favors near-the-money strikes. Theta handling only checks for absolute theta ratios and ignores delta-adjusted decay, so short-dated contracts still score positively if other heuristics fire.【F:src/scoring/risk_reward.py†L8-L53】
- **Gamma squeeze signal** – The upstream detector only inspects near-the-money call open interest and volume; it never estimates dealer positioning, sign of gamma, or max-pain style pivots.【F:scripts/fetch_options_data.py†L69-L101】

Because every scorer uses static tiers, the composite score is effectively a linear tally of hand-tuned thresholds with little cross-factor validation. There is no probabilistic context or normalization besides the hard cap applied at the end of the engine.【F:src/scoring/engine.py†L12-L61】

## 2. Missing Quantitative Foundations
The current pipeline lacks several core statistical pillars needed for institutional-quality signal generation:

1. **Implied-volatility distribution context** – No IV z-score or percentile versus the strike-specific historical distribution. IV Rank approximates the 52-week range for the underlying, not the option series itself.【F:src/scoring/iv_rank.py†L8-L31】
2. **Implied vs. realized volatility spread** – There is no realized volatility estimator or IV–RV differential to classify mispricing opportunities.【F:scripts/fetch_options_data.py†L20-L64】
3. **Skew diagnostics** – Put/call skew is not computed; signals cannot differentiate between euphoric call buying and crash protection bid.
4. **Gamma exposure modeling** – Dealer gamma positioning, gamma flip levels, and squeeze thresholds are unmodeled; current logic is a simple open-interest ratio filter.【F:scripts/fetch_options_data.py†L69-L101】
5. **Arbitrage and structural mispricing** – No checks for put-call parity violations, butterflies, or calendar spreads.

## 3. Recommended Quant Modules
To replace the rule soup with a measurable ensemble, we should implement:

| Module | Purpose | Notes |
| --- | --- | --- |
| `IVAnomalyDetector` | Calculate strike-specific IV z-scores, percentiles, and mean-reversion statistics. | Requires historical IV storage and minimum sample-size guardrails. |
| `VolSpreadAnalyzer` | Compare implied and realized vol to flag overpriced premium. | Needs daily price history ingestion. |
| `SkewMonitor` | Track ATM call/put IV differential and standard deviation versus history. | Output bullish/bearish skew signals. |
| `GammaExposureModel` | Estimate dealer gamma by strike, compute gamma flip, and rank squeeze risk. | Uses per-contract greeks and open interest; can leverage numerically computed gammas already available. |
| `MispricingDetector` | Scan for put-call parity, butterfly, and calendar arbitrage. | Provides severity and theoretical vs. market values. |

Each module should emit a 0–100 normalized score plus explanatory metadata so the composite scorer can act as a weighted ensemble rather than additive heuristics.

## 4. Explainability Layer
Signals today surface only short text snippets stored in the score metadata. There is no structured narrative that ties catalysts, risk, and trade mechanics together. A template-driven NLG layer (e.g., Jinja2) should assemble:

1. Executive summary with signal classification (IV expansion, gamma squeeze, mispricing, etc.).
2. Primary catalyst explanation grounded in quantitative outputs (z-scores, percentile ranks, exposure magnitudes).
3. Supporting factors that cross-reference other modules.
4. Risk assessment (theta bleed, liquidity concerns, historical win rates).
5. Trade mechanics with breakeven, payoff estimates, and theta decay.

## 5. Four-Sprint Roadmap
A pragmatic build sequence to reach a production-ready MVP:

1. **Sprint 1 – Data Foundation (Weeks 1–2)**
   - Integrate with a real options data vendor (Polygon/Tradier) and normalize chains.
   - Stand up PostgreSQL/TimescaleDB storage for option metadata and intraday snapshots.
   - Create centralized config management (YAML + environment overrides) and logging.

2. **Sprint 2 – Quant Engine (Weeks 3–4)**
   - Implement the statistical modules above with async database access.
   - Assemble an ensemble scorer that requires agreement between multiple high-confidence factors before flagging anomalies.
   - Add flow imbalance, liquidity, and other secondary factors as lightweight scorers.

3. **Sprint 3 – Explainability & Dashboard (Weeks 5–6)**
   - Build the templated explanation generator with historical outcome backfill for context.
   - Modernize the dashboard (Next.js + WebSocket feed) with expandable signal cards and filters.

4. **Sprint 4 – Alerting & Backtesting (Weeks 7–8)**
   - Implement multi-channel alert dispatcher with cooldown logic.
   - Ship historical backtesting engine with capital allocation, exit rules, and Plotly-based reporting to validate edge before production alerts.

## 6. Immediate Next Steps Checklist
- Stand up a dedicated project structure (`src/`, `config/`, `migrations/`, `dashboard/`) with virtual environment and dependency management.
- Acquire vendor API keys and configure `.env`, `config/dev.yaml`, and `config/prod.yaml` with scanning thresholds and alerting parameters.
- Prioritize building the data layer (adapters, storage, Pydantic models) before enhancing scoring logic.
- Once data plumbing is reliable, iterate on quant modules with unit/integration tests and bake their outputs into both the ensemble scorer and explanation engine.

Documenting these gaps and the follow-on roadmap should make upcoming PRs more surgical: each sprint delivers a cohesive slice (data, quant, explainability, operations) instead of additional ad-hoc heuristics.
