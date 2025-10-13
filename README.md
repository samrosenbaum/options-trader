# Options Trading Dashboard

A comprehensive web-based options trading dashboard that analyzes derivative options and identifies trading opportunities with high potential returns.

## Features

- **Real-time Options Scanning**: Analyzes live options data using yfinance (no API keys required)
- **AI-Powered Analysis**: Multi-factor scoring system evaluating IV rank, volume, liquidity, and Greeks
- **Live News Feed**: Market sentiment analysis from real-time news
- **Cost Calculator**: Calculate potential profits, losses, and breakeven points
- **Data Visualizations**: Charts for price history, volume, portfolio performance, and IV

## Setup

### 1. Install Python Dependencies

\`\`\`bash
pip install -r requirements.txt
\`\`\`

### 2. Install Node Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Start the FastAPI Scoring Service

```bash
uvicorn src.api.main:app --reload --port 8000
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Test Python Scripts Directly

\`\`\`bash
# Scan for options opportunities
python3 scripts/fetch_options_data.py

# Get market news
python3 scripts/fetch_market_news.py

# Get stock quotes
python3 scripts/get_stock_quotes.py AAPL,MSFT,NVDA
\`\`\`

## Controlling the Scanner Symbol Universe

The bulk options fetcher combines a core list of liquid tickers with any symbols defined in your environment's watchlists. You can control how many of these names are requested in two ways:

- **Configuration**: Set `fetcher.max_priority_symbols` in `config/dev.yaml`, `config/prod.yaml`, or a custom environment file. Use `null` to scan the full list or provide an integer to cap requests (e.g. `max_priority_symbols: 50`). Adjust `fetcher.max_runtime_seconds` to enforce a global time budget for option-chain fetching when deploying to platforms with strict execution limits.
- **Command line override**: When running `scripts/smart_options_scanner.py`, pass `--max-symbols <N>` to temporarily limit the scan. Omit the flag or pass `0` to use the configured/default behaviour.

This makes it easy to widen the search universe in research environments while applying tighter limits in production to reduce load on upstream data providers.

## How It Works

### Data Sources (100% Free)

- **yfinance**: Real-time stock quotes, options chains, and news
- **No API keys required**: All data is freely available

### Opportunity Scoring Algorithm

The scanner evaluates options based on:

1. **Volume/Open Interest Ratio** (25 pts): Detects unusual options activity
2. **IV Rank** (25 pts): Identifies volatility expansion/contraction opportunities
3. **Moneyness** (15 pts): Optimal strike selection near ATM
4. **Bid-Ask Spread** (15 pts): Ensures high liquidity
5. **Open Interest** (10 pts): Confirms market depth
6. **Delta Efficiency** (10 pts): Leverage analysis
7. **Risk/Reward Ratio** (10 pts): Potential return vs cost

**Minimum Score**: 60/100 to be displayed as an opportunity

### Greeks Calculation

Uses Black-Scholes approximations with scipy for:
- **Delta**: Price sensitivity
- **Gamma**: Delta change rate
- **Theta**: Time decay
- **Vega**: Volatility sensitivity

## API Endpoints

- `POST /scan` (FastAPI service): Score option contracts and return structured trading signals
- `GET /api/scan`: Next.js route that proxies to the FastAPI scoring engine
- `GET /api/news-python`: Fetch market news with sentiment analysis
- `GET /api/quotes-python?symbols=AAPL,MSFT`: Get real-time stock quotes

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Node.js runtime)
- **Data Analysis**: Python, yfinance, pandas, numpy, scipy
- **Charts**: Recharts
- **UI Components**: shadcn/ui

## Deployment

### Render

This repository includes a `render.yaml` blueprint that provisions a single Node
service capable of running both the Next.js application and the Python helper
scripts. The build process creates a project-local virtual environment so the
runtime can spawn Python processes reliably.

1. Create a new **Blueprint** on [Render](https://render.com) and point it to
   this repository.
2. Render will detect `render.yaml` and provision the service automatically.
3. During the build phase the commands defined in the blueprint will:
   - Create a virtual environment in `./venv`
   - Install the Python dependencies from `requirements.txt`
   - Install the Node.js dependencies with `npm ci`
   - Run `npm run build`
4. On deploy, Render runs `npm run start` with the same virtual environment so
   all API routes that shell out to Python continue to work.

> **Tip:** If you run a manual deployment or need to debug locally, mimic the
> blueprint by creating a venv in the repository root (`python3 -m venv venv`),
> activating it, and installing the Python dependencies before starting the
> Next.js server.

### Other platforms

Hosting providers without persistent access to a Python runtime (for example,
serverless-only platforms) are not currently supported because several API
routes rely on Python libraries such as `yfinance` and `pandas`.

If you still want to deploy on a serverless host (Render static sites, Railway
static, Vercel, AWS Lambda, etc.), set the environment variable
`DISABLE_PYTHON_SCANNER=1`. When this flag is present, the application skips the
Python scanners and immediately serves the bundled fallback dataset. This avoids
HTTP 502/timeout errors at the cost of losing real-time market scanning.

## Disclaimer

This dashboard is for educational and informational purposes only. It is not financial advice. Always do your own research and consult with a licensed financial advisor before making investment decisions.
