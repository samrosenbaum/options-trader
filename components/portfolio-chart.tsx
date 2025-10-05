"use client"

import { Card } from "@/components/ui/card"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { generatePortfolioPerformance } from "@/lib/chart-data"

export function PortfolioChart() {
  const data = generatePortfolioPerformance()

  return (
    <Card className="bg-card p-6">
      <div className="mb-4">
        <h4 className="font-semibold text-foreground">Portfolio Performance</h4>
        <p className="text-sm text-muted-foreground">12-month value tracking</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(142 76% 36%)"
            strokeWidth={2}
            dot={{ fill: "hsl(142 76% 36%)", r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
