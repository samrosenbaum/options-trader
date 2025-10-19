import { NextResponse } from "next/server";

import { getAIStrategyHubData } from "@/lib/ai-strategy-hub/service";

export async function GET() {
  const payload = await getAIStrategyHubData();
  return NextResponse.json(payload);
}
