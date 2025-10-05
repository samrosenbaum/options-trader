"use client"

import { Card } from "@/components/ui/card"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { generateImpliedVolatility } from "@/lib/chart-data"

export function IVChart() {
  const data = generateImpliedVolatility()

  return (
    <Card className="bg-card p-6">
      <div className="mb-4">
        <h4 className="font-semibold text-foreground">Implied Volatility Smile</h4>
        <p className="text-sm text-muted-foreground">IV across strike prices</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="strike" stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: "12px" }}
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
            formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
          />
          <Line
            type="monotone"
            dataKey="iv"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            dot={{ fill: "hsl(217 91% 60%)", r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
