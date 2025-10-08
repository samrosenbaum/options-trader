# Top Option Evaluation: AAPL 15 Nov 2025 $175 Put

## Scanner Output Snapshot

| Metric | Value |
| --- | --- |
| Underlying price | $172.05 |
| Option type | Put |
| Strike | $175 |
| Premium (mid) | $3.20 |
| Bid / Ask | $3.10 / $3.30 |
| Volume / Open interest | 5,200 / 2,100 (2.48x) |
| Implied volatility | 35% |
| Days to expiration | 37 |
| Breakeven price | $171.80 (needs ~0.15% drop) |
| 10% downside ROI | +530% (net +$1,695) |
| 15% downside ROI | +799% (net +$2,556) |
| Probability of profit (model) | ~49.6% |
| Risk level (scanner) | Medium |

> Source: `python -m src.scanner.service --json-indent 2` using the cached dataset on 8 Oct 2025 at 04:01 UTC.

## Monte Carlo Scenario Test

To sanity-check the opportunity we simulated 50,000 paths using the contract's implied volatility (35%) and 37 calendar days to expiration. The simulation assumes log-normal price moves with zero drift.

* Expected P&L: **+$602.93**
* Probability of finishing profitable: **51.5%**
* Probability of finishing with a loss: **48.5%**
* Probability of taking the maximum loss (option expires worthless): **41.8%**

> Source: `python` Monte Carlo script invoking `run_scan` with a static batch builder (chunk `ba73f0`).

## Assessment

* The put is essentially at-the-money: only a 0.15% drop is needed to break even, so any modest decline in AAPL over the next month yields a profit.
* The payoff profile is highly convex — a 10% downside move (within a one-standard-deviation band for 35% IV) converts $320 of risk into $1,695 of profit. However, that scenario still requires a meaningful catalyst.
* Implied probability of profit hovers around 50%; with almost half of the Monte Carlo paths losing money and 41.8% expiring worthless, conviction must come from a bearish thesis on AAPL rather than the option structure alone.
* Liquidity is excellent (tight $0.20 spread, 2.5× volume to open interest), so trade execution risk is low.

**Verdict:** Attractive risk/reward *if* you already expect a sustained drop in AAPL inside 37 days. Without a strong bearish catalyst, the coin-flip probability and sizable chance of max loss make it a speculative hedge rather than a high-conviction standalone trade.
