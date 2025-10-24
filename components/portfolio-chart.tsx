"use client"

import { Card } from "@/components/ui/card"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useEffect, useState } from "react"
import { format } from "date-fns"

interface PortfolioSnapshot {
  snapshot_date: string
  total_value: number
}

export function PortfolioChart() {
  const [data, setData] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPortfolioData() {
      try {
        const response = await fetch('/api/portfolio-snapshot?days=30')
        if (!response.ok) throw new Error('Failed to fetch portfolio data')

        const snapshots: PortfolioSnapshot[] = await response.json()

        const chartData = snapshots.map((snapshot) => ({
          date: format(new Date(snapshot.snapshot_date), 'MMM d'),
          value: snapshot.total_value,
        }))

        setData(chartData)
      } catch (error) {
        console.error('Error fetching portfolio data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPortfolioData()
  }, [])

  if (loading) {
    return (
      <Card className="bg-card p-6">
        <div className="mb-4">
          <h4 className="font-semibold text-foreground">Portfolio Performance</h4>
          <p className="text-sm text-muted-foreground">30-day value tracking</p>
        </div>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          Loading chart data...
        </div>
      </Card>
    )
  }

  return (
    <Card className="bg-card p-6">
      <div className="mb-4">
        <h4 className="font-semibold text-foreground">Portfolio Performance</h4>
        <p className="text-sm text-muted-foreground">30-day value tracking</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
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
            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total Value']}
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
