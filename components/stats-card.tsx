import { Card } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string
  change?: string
  changeType?: "positive" | "negative" | "neutral"
  icon: LucideIcon
  subtitle?: string
}

export function StatsCard({ title, value, change, changeType = "neutral", icon: Icon, subtitle }: StatsCardProps) {
  return (
    <Card className="bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">{value}</p>
          {change && (
            <p
              className={cn(
                "mt-1 font-mono text-sm font-semibold",
                changeType === "positive" && "text-bull",
                changeType === "negative" && "text-bear",
                changeType === "neutral" && "text-muted-foreground",
              )}
            >
              {change}
            </p>
          )}
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  )
}
