export type RiskProfileKey = "starter" | "balanced" | "aggressive";

export interface RiskProfile {
  id: RiskProfileKey;
  label: string;
  description: string;
}

export type BrokerId = "robinhood" | "webull" | "tastytrade" | "fidelity";

export interface BrokerOption {
  id: BrokerId;
  label: string;
}

export interface BrokerNoteMap {
  default: string;
  robinhood?: string;
  webull?: string;
  tastytrade?: string;
  fidelity?: string;
}

export interface StrategyPlay {
  id: string;
  name: string;
  suits: RiskProfileKey[];
  scenario: string;
  capitalRange: string;
  timeframe: string;
  confidence: number;
  aiSupport: string[];
  entryChecklist: string[];
  exitPlan: string;
  brokerNotes: BrokerNoteMap;
}

export type MarketRegimeTone = "calm" | "volatile" | "transition";

export interface MarketRegimePlay {
  id: string;
  name: string;
  tone: MarketRegimeTone;
  indicators: string[];
  recommendedPlays: string[];
  aiBrief: string;
}

export interface EarningsCompanionEntry {
  ticker: string;
  eventDate: string;
  aiTakeaway: string;
  historicalStats: string;
  suggestedPlays: string[];
  prepChecklist: string[];
}

export interface RiskGuardrail {
  id: string;
  trigger: string;
  guardrail: string;
  aiNudge: string;
  automation: string;
}

export interface FlowSignal {
  symbol: string;
  headline: string;
  context: string;
  whyItMatters: string;
  followUp: string;
}

export interface EducationMoment {
  topic: string;
  prompt: string;
  aiResponse: string;
  challenge: string;
}

export type BuildStatus = "planned" | "in-progress" | "ready";

export interface BuildRequirement {
  id: string;
  title: string;
  summary: string;
  dependencies: string[];
  owner: "data" | "frontend" | "ai" | "product";
  effort: "S" | "M" | "L";
  status: BuildStatus;
  successMetric: string;
}

export interface ImplementationPhase {
  id: string;
  title: string;
  focus: string;
  eta: string;
  deliverables: string[];
}

export interface AIStrategyHubData {
  generatedAt: string;
  riskProfiles: RiskProfile[];
  brokerOptions: BrokerOption[];
  strategyPlaybook: StrategyPlay[];
  marketRegimes: MarketRegimePlay[];
  earningsCompanion: EarningsCompanionEntry[];
  riskGuardrails: RiskGuardrail[];
  flowSignals: FlowSignal[];
  educationMoments: EducationMoment[];
  buildRequirements: BuildRequirement[];
  implementationPhases: ImplementationPhase[];
}
