import { StatsCard } from "@/components/stats-card"
import { TrendingUp, Target, DollarSign, Activity } from "lucide-react"

export function DashboardStats() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Active Positions"
        value="12"
        change="+3 this week"
        changeType="positive"
        icon={Activity}
        subtitle="8 calls, 4 puts"
      />
      <StatsCard
        title="Total P&L"
        value="$8,450"
        change="+12.5%"
        changeType="positive"
        icon={DollarSign}
        subtitle="Last 30 days"
      />
      <StatsCard
        title="Win Rate"
        value="68%"
        change="+5% vs last month"
        changeType="positive"
        icon={Target}
        subtitle="Based on 45 trades"
      />
      <StatsCard
        title="Opportunities"
        value="23"
        change="High confidence"
        changeType="neutral"
        icon={TrendingUp}
        subtitle="Updated 2 min ago"
      />
    </div>
  )
}
