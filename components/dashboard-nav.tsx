"use client"

import { LayoutDashboard, TrendingUp, Newspaper, Calculator, BarChart3, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

const navItems = [
  { icon: LayoutDashboard, label: "Overview", id: "overview" },
  { icon: TrendingUp, label: "Options Scanner", id: "scanner" },
  { icon: Newspaper, label: "News Feed", id: "news" },
  { icon: Calculator, label: "Calculator", id: "calculator" },
  { icon: BarChart3, label: "Analytics", id: "analytics" },
  { icon: Settings, label: "Settings", id: "settings" },
]

export function DashboardNav() {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <nav className="border-b border-border bg-card">
      <div className="flex items-center gap-1 px-6">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
