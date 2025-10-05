"use client"

import { Card } from "@/components/ui/card"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { generateOptionsVolumeData } from "@/lib/chart-data"

export function VolumeChart() {
  const data = generateOptionsVolumeData()

  return (
    <Card className="bg-card p-6">
      <div className="mb-4">
        <h4 className="font-semibold text-foreground">Options Volume</h4>
        <p className="text-sm text-muted-foreground">Calls vs Puts volume comparison</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Legend />
          <Bar dataKey="calls" fill="hsl(142 76% 36%)" name="Calls" radius={[4, 4, 0, 0]} />
          <Bar dataKey="puts" fill="hsl(0 84% 60%)" name="Puts" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
