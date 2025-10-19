import { type AIStrategyHubData } from "./types";

export const mockAIStrategyHubData: AIStrategyHubData = {
  generatedAt: new Date().toISOString(),
  riskProfiles: [
    {
      id: "starter",
      label: "Starter Account",
      description:
        "Capital under $2k, loves lotto tickets but needs defined risk.",
    },
    {
      id: "balanced",
      label: "Leveling Up",
      description: "Account between $2k-$10k, wants consistent weekly paydays.",
    },
    {
      id: "aggressive",
      label: "Degenerate Strategist",
      description:
        "Comfortable with volatility, leans into momentum and gamma squeezes.",
    },
  ],
  brokerOptions: [
    { id: "robinhood", label: "Robinhood" },
    { id: "webull", label: "Webull" },
    { id: "tastytrade", label: "tastytrade" },
    { id: "fidelity", label: "Fidelity" },
  ],
  strategyPlaybook: [
    {
      id: "momentum-debit-spread",
      name: "Trending Momentum Debit Spread",
      suits: ["starter", "balanced"],
      scenario:
        "Ticker is ripping on WallStreetBets chatter, but you want defined risk into the next 5 trading days.",
      capitalRange: "$120 – $250",
      timeframe: "3-7 trading days",
      confidence: 68,
      aiSupport: [
        "LLM condenses social chatter + Robinhood Top 100 flow into a clear directional thesis.",
        "Probability engine checks implied vs. historical move to keep expectations realistic.",
        "Coach generates a Discord-ready TL;DR with entry/exit levels.",
      ],
      entryChecklist: [
        "IV rank between 30-55 to avoid brutal crush.",
        "Underlying trending above 8-day EMA with volume > 150% of average.",
        "Contract spread width sized to stay under daily PDT limits.",
      ],
      exitPlan:
        "Scale out at 60% gain or two trading days before earnings to dodge IV crush.",
      brokerNotes: {
        default:
          "Defined-risk debit spread executes cleanly with single ticket entry.",
        robinhood:
          "Use custom spread ticket; AI pre-fills limit debit and sets 50% profit target automation.",
        webull:
          "Route as two legs with shared limit; AI suggests auto-close at -35% to keep day trades open.",
      },
    },
    {
      id: "earnings-volatility-neutralizer",
      name: "Earnings Straddle Rental",
      suits: ["balanced", "aggressive"],
      scenario:
        "You want to rent volatility on names with cult followings (think PLTR, NVDA) without YOLO risk.",
      capitalRange: "$350 – $600",
      timeframe: "Hold through earnings print",
      confidence: 62,
      aiSupport: [
        "Event Companion shows implied move vs. historic gap to calibrate contract width.",
        "AI scripts post-earnings management checklist based on volatility reaction scenarios.",
        "Greeks monitor pings you when gamma flips negative so you can exit before theta nukes value.",
      ],
      entryChecklist: [
        "Implied move at least 1.2× larger than median realized gap.",
        "Social sentiment mixed/uncertain — good for volatility renting.",
        "Spread the strikes to stay under 5% account at risk.",
      ],
      exitPlan:
        "Close 50% of position on open if realized move exceeds implied; otherwise roll one side into credit spread.",
      brokerNotes: {
        default: "Requires multi-leg support and ability to roll quickly.",
        tastytrade:
          "Route as iron fly template; AI exports management plan into playbook notes.",
        robinhood:
          "Use “custom” ticket; AI reminder triggers to manage legs separately if platform lags.",
      },
    },
    {
      id: "gamma-squeeze-scout",
      name: "Gamma Squeeze Scout Ratio",
      suits: ["aggressive"],
      scenario:
        "Unusual call flow explodes on meme names; you want asymmetric payoff with controlled debit.",
      capitalRange: "$80 – $180",
      timeframe: "1-3 trading days",
      confidence: 58,
      aiSupport: [
        "Flow Synthesizer flags sweep clusters + retail open-interest delta.",
        "Market Regime Radar confirms high-vol backdrop so risk is managed.",
        "AI auto-writes WSB-ready post explaining thesis with memes optional.",
      ],
      entryChecklist: [
        "Call sweep volume > 3× normal with expiry inside two weeks.",
        "Short interest above 12% or options volume skew > 1.8.",
        "Budget < 3% account; AI sets alerts for exit at +150% or -60%.",
      ],
      exitPlan:
        "Let winner run into squeeze but force close before Friday close unless thesis reinforced.",
      brokerNotes: {
        default: "Needs ability to build ratio (1x2) spreads quickly.",
        robinhood:
          "Use two separate orders; AI reminder ensures second leg filled near credit target.",
        webull:
          "Route via advanced order ticket with simultaneous legs; AI publishes limit ladder.",
      },
    },
  ],
  marketRegimes: [
    {
      id: "vol-crush",
      name: "Chill Vibes / Low IV",
      tone: "calm",
      indicators: [
        "VIX term structure upward sloping, front-month at 13.2",
        "Retail put/call ratio below 0.7, call flow dominating",
        "Fewer than 5 mega-cap earnings in next 10 days",
      ],
      recommendedPlays: [
        "Calendar spreads on megacap tech with AI-managed roll reminders",
        "Put credit spreads on names with strong AI trend score",
        "Delta-neutral strangles sized to small debit for lotto hunters",
      ],
      aiBrief:
        "AI suggests leaning into time spreads and short premium plays while keeping allocation tight. Nudges you when regime shifts.",
    },
    {
      id: "vol-spike",
      name: "Chaos Mode / High IV",
      tone: "volatile",
      indicators: [
        "Spot VIX spike above 22 with skew flattening",
        "Dark pool put volume surging on cyclical names",
        "BTC implied vol rising — cross-asset stress flag",
      ],
      recommendedPlays: [
        "Broken wing butterflies to capture vol crush while defining risk",
        "Long dated call diagonals on quality growth with AI-managed hedges",
        "Cash-secured puts on favorite WSB tickers sized by risk diary",
      ],
      aiBrief:
        "Market Regime Radar shouts caution: size down, favor defined risk, and let AI auto-stress-test your portfolio nightly.",
    },
    {
      id: "transition",
      name: "On the Verge / Regime Flip",
      tone: "transition",
      indicators: [
        "IV rank climbing but still under 40",
        "Macro calendar loaded with Fed speakers + CPI",
        "Retail sentiment mixed, flows rotating from calls to straddles",
      ],
      recommendedPlays: [
        "Collar existing winners with AI-optimized hedge strikes",
        "Starter iron condor with dynamic width suggestions",
        "Waitlist plays — AI pings when confirmation arrives",
      ],
      aiBrief:
        "Keep dry powder ready. AI pushes “if/then” automations so you can trigger trades without staring at screens all day.",
    },
  ],
  earningsCompanion: [
    {
      ticker: "PLTR",
      eventDate: "Nov 12 • AMC",
      aiTakeaway:
        "Implied move 11.2% vs. realized median 6.4%. AI tilt: slight upside because government contracts trending positive.",
      historicalStats:
        "Past 8 quarters: 5 upside gaps, average IV crush -18% within 2 sessions.",
      suggestedPlays: [
        "Long call calendar targeting next weekly cycle (defined theta bleed).",
        "Delta-neutral iron fly sized at 3% of account with auto-roll instructions.",
      ],
      prepChecklist: [
        "Review AI sentiment digest from transcripts + Reddit threads.",
        "Set conditional orders to peel profits at 75% of max gain.",
        "Schedule post-earnings debrief — AI will log outcome + lessons.",
      ],
    },
    {
      ticker: "COIN",
      eventDate: "Nov 14 • AMC",
      aiTakeaway:
        "Crypto beta running hot; implied move 9.5% while realized swings average 12%. AI bias: leave runners on upside.",
      historicalStats:
        "IV crush historically mild (-9%) when BTC trending up into report.",
      suggestedPlays: [
        "Directional call debit spread targeting breakout above resistance.",
        "Hedge with cheap weeklies put for overnight protection.",
      ],
      prepChecklist: [
        "Sync account with risk diary to confirm capital allocation.",
        "Enable AI volatility alert in case BTC reverses mid-call.",
        "Draft exit statement for community journal — keeps discipline tight.",
      ],
    },
  ],
  riskGuardrails: [
    {
      id: "overconcentration",
      trigger:
        "More than 30% of account tied up in a single meme ticker options chain.",
      guardrail:
        "AI suggests trimming to 15% and reallocating into uncorrelated setup.",
      aiNudge:
        "Risk Diary posts a notification with suggested contracts to close first.",
      automation:
        "One-tap rebalance script exports to broker API (or manual checklist).",
    },
    {
      id: "theta-drift",
      trigger: "Premium decay pacing at >1.5% per hour on lotto contracts.",
      guardrail:
        "AI prompts scale-out or convert to vertical spread to salvage value.",
      aiNudge:
        "Guardrail DM hits your phone with Greek snapshot + suggested roll strikes.",
      automation:
        "Auto-create closing orders at limit price anchored to mid - 0.05.",
    },
    {
      id: "event-collision",
      trigger:
        "Portfolio exposed to CPI + FOMC within same week with high delta.",
      guardrail:
        "Shift to neutral via calendars and protective puts on index heavyweights.",
      aiNudge:
        "Scenario simulator shares stress-test video clip summarizing outcomes.",
      automation:
        "Generate hedge basket and push to watchlist for quick execution.",
    },
  ],
  flowSignals: [
    {
      symbol: "TSLA",
      headline: "Triple call sweeps targeting weekly 250C",
      context:
        "Retail open interest +18% overnight, AI sentiment gauge flips bullish.",
      whyItMatters:
        "Signals potential gamma squeeze; align with momentum spread above 248 pivot.",
      followUp:
        "Add to watchlist with AI auto-trailing stop once position opened.",
    },
    {
      symbol: "NVDA",
      headline: "Dark pool accumulation while IV drifts lower",
      context:
        "Institutions gobbling shares; AI sees divergence vs. retail call buying fading.",
      whyItMatters:
        "Great candidate for diagonal spread leaning long delta with limited theta risk.",
      followUp: "Push setup to Playbook Coach for sizing suggestions.",
    },
  ],
  educationMoments: [
    {
      topic: "IV Crush vs. Hype",
      prompt:
        "“Why did my earnings calls implode even though the stock went up?”",
      aiResponse:
        "AI explains that implied volatility collapsed post-print and walks through how to stagger exits before the announcement.",
      challenge:
        "Assigns micro-lesson with replay of historical trades + quick quiz to cement the concept.",
    },
    {
      topic: "Risk Budgeting Basics",
      prompt: "“Can I take two lotto trades this week with a $3k account?”",
      aiResponse:
        "Coach breaks down max recommended debit per trade, compares to existing exposure, and suggests a staggered entry plan.",
      challenge:
        "Offers checklist to journal after trade to reinforce discipline.",
    },
  ],
  buildRequirements: [
    {
      id: "data-ingestion",
      title: "Broker + market data ingestion",
      summary:
        "Stand up connectors for Robinhood, Webull, and community sentiment APIs so AI signals are grounded in live telemetry.",
      dependencies: [
        "Supabase auth + account linking",
        "Stream ingestion pipeline",
        "Rate-limit guardrails",
      ],
      owner: "data",
      effort: "L",
      status: "planned",
      successMetric: "Latency under 60s from market print to hub refresh.",
    },
    {
      id: "ai-coach-orchestration",
      title: "AI coach orchestration layer",
      summary:
        "Centralize prompts, retrieval, and action scripts across playbook, guardrails, and education moments.",
      dependencies: [
        "Vector store for transcripts & WSB data",
        "Prompt templates",
        "Action routing service",
      ],
      owner: "ai",
      effort: "M",
      status: "in-progress",
      successMetric: "90%+ successful task completion in internal dry runs.",
    },
    {
      id: "portfolio-sync",
      title: "Risk diary portfolio sync",
      summary:
        "Continuously mirror open positions, Greeks, and cash balances for guardrail automation.",
      dependencies: [
        "Broker OAuth handshake",
        "Positions normalization schema",
      ],
      owner: "frontend",
      effort: "M",
      status: "planned",
      successMetric:
        "Positions refresh within 2 minutes and reconcile with broker statements.",
    },
    {
      id: "community-layer",
      title: "Community play replay + journaling",
      summary:
        "Ship shared journaling templates and auto-generated TL;DR posts for Discord/WSB threads.",
      dependencies: ["User-generated content moderation", "Template library"],
      owner: "product",
      effort: "S",
      status: "ready",
      successMetric:
        "75% of beta cohort publishes at least one recap per week.",
    },
  ],
  implementationPhases: [
    {
      id: "phase-alpha",
      title: "Alpha data backbone",
      focus: "Get live signals flowing and prove latency + accuracy.",
      eta: "4 weeks",
      deliverables: [
        "Broker position sync MVP with manual refresh",
        "Market regime classifier running nightly batch",
        "Basic LLM prompt library for coach + education",
      ],
    },
    {
      id: "phase-beta",
      title: "Beta automation + guardrails",
      focus: "Trigger risk workflows and auto-generate journal recaps.",
      eta: "8 weeks",
      deliverables: [
        "Risk diary alert service with push notifications",
        "Scenario simulator wired to volatility stress tests",
        "Template exports for Discord + broker automation scripts",
      ],
    },
    {
      id: "phase-ga",
      title: "General availability polish",
      focus: "Tighten UI, reliability, and personalized learning loops.",
      eta: "12 weeks",
      deliverables: [
        "A/B tested education nudges",
        "Full broker coverage with OAuth refresh tokens",
        "Self-serve playbook customization + sharing",
      ],
    },
  ],
};
