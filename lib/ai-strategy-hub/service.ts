import { mockAIStrategyHubData } from "./mock-data";
import type { AIStrategyHubData } from "./types";

const safeClone: <T>(data: T) => T =
  typeof structuredClone === "function"
    ? structuredClone
    : <T>(data: T) => JSON.parse(JSON.stringify(data));

export async function getAIStrategyHubData(): Promise<AIStrategyHubData> {
  return safeClone({
    ...mockAIStrategyHubData,
    generatedAt: new Date().toISOString(),
  });
}
