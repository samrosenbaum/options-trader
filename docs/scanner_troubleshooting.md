# Enhanced Scanner Troubleshooting

This page explains how to distinguish between a successful enhanced scan that simply produced no opportunities and a scan that failed (for example, due to a timeout).

## How to tell the scan succeeded but found nothing

The diagnostic payload in the question shows several cues that the enhanced scanner ran to completion:

* **`Total Evaluated` equals `totalOptions`** – all fetched contracts were scored, so the pipeline did not abort mid-run.
* **`Raw Opportunity Count` and `Sanitized Opportunity Count` are zero**, paired with the reason `no_enhanced_results`. This indicates the scan finished but the ranking filters did not surface any candidates.
* **Stdout tail contains a per-symbol summary** (e.g., `✅ SMCI: 529 options`) culminating in `Total options fetched: 7569` and `Successful symbols: 15/15`. These lines are emitted only after the full scan loop completes.
* **`cacheAgeMinutes: 0` and `cacheHit: false`** demonstrate that fresh live data was pulled rather than timing out.

When you see these signals together, the scanner is operating normally—there were simply no trades that satisfied the institutional-grade filters at that moment.

## How to recognize a timeout or infrastructure failure

Look for the following patterns instead:

* **Missing per-symbol success lines** or a `Successful symbols` count below the requested symbol count. This usually means the fetcher aborted, often due to timeouts or upstream data issues.
* **Presence of error reasons such as `timeout`, `upstream_error`, or `fetch_failed`** in the `Reason`/`Details` fields rather than `no_enhanced_results`.
* **`totalEvaluated` less than `totalOptions`** or both numbers at zero, indicating the scoring stage never ran.
* **Stderr tail** containing warnings like `Timed out waiting for quote data` or retries, instead of the clean completion banner.
* **Old `cacheTimestamp` with `cacheStale: true`**, which means the system fell back to stale cache after failing to refresh live data.

If you encounter these timeout indicators, re-run the scan or consult the logs in `logs/` for stack traces to determine whether network connectivity or the market data adapter needs attention.
