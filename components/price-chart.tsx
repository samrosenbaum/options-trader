"use client"

import { Card } from "@/components/ui/card"
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts"
import { generatePriceHistory } from "@/lib/chart-data"
import { mockMarketData } from "@/lib/mock-data"

export function PriceChart() {
  const data = generatePriceHistory("AAPL", mockMarketData[0].price)

  return (
    <Card className="bg-card p-6">
      <div className="mb-4">
        <h4 className="font-semibold text-foreground">Price History</h4>
        <p className="text-sm text-muted-foreground">30-day price movement</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" fill="url(#priceGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
