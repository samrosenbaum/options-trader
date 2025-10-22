"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings, Save, Loader2 } from "lucide-react"
import Navigation from "@/components/navigation"

const brokerOptions = [
  { id: "robinhood", label: "Robinhood" },
  { id: "webull", label: "Webull" },
  { id: "schwab", label: "Charles Schwab" },
  { id: "etrade", label: "E-Trade" },
  { id: "fidelity", label: "Fidelity" },
  { id: "td", label: "TD Ameritrade" },
  { id: "ibkr", label: "Interactive Brokers" },
  { id: "tastytrade", label: "Tastytrade" },
  { id: "other", label: "Other" },
]

const strategyOptions = [
  { id: "yolo", label: "YOLO - Maximum Upside" },
  { id: "aggressive", label: "Aggressive Growth" },
  { id: "balanced", label: "Balanced" },
  { id: "conservative", label: "Conservative" },
  { id: "income", label: "Income Generation" },
]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState("")
  const [broker, setBroker] = useState("")
  const [tradingStrategy, setTradingStrategy] = useState("")
  const [portfolioSize, setPortfolioSize] = useState("")
  const [dailyBudget, setDailyBudget] = useState("")

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/user-settings")
      const data = await response.json()
      
      if (data.settings) {
        setUserName(data.settings.user_name || "")
        setBroker(data.settings.broker || "")
        setTradingStrategy(data.settings.trading_strategy || "")
        setPortfolioSize(data.settings.portfolio_size || "")
        setDailyBudget(data.settings.daily_contract_budget || "")
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: userName,
          broker,
          trading_strategy: tradingStrategy,
          portfolio_size: portfolioSize ? parseFloat(portfolioSize) : null,
          daily_contract_budget: dailyBudget ? parseFloat(dailyBudget) : null,
        }),
      })

      if (response.ok) {
        // Show success message or redirect
        router.push("/ai-strategy-hub")
      } else {
        alert("Failed to save settings")
      }
    } catch (error) {
      console.error("Failed to save settings:", error)
      alert("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <Navigation />
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            User Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure your trading preferences to get personalized recommendations
          </p>
        </div>

      <div className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Tell us a bit about yourself
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Name</Label>
              <Input
                id="userName"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Trading Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Trading Profile</CardTitle>
            <CardDescription>
              Help us understand your trading setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="broker">Brokerage</Label>
              <Select value={broker} onValueChange={setBroker}>
                <SelectTrigger id="broker">
                  <SelectValue placeholder="Select your broker" />
                </SelectTrigger>
                <SelectContent>
                  {brokerOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="strategy">Trading Strategy</Label>
              <Select value={tradingStrategy} onValueChange={setTradingStrategy}>
                <SelectTrigger id="strategy">
                  <SelectValue placeholder="Select your strategy" />
                </SelectTrigger>
                <SelectContent>
                  {strategyOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Settings</CardTitle>
            <CardDescription>
              Optional: Help us calibrate risk recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolioSize">Portfolio Size (optional)</Label>
              <Input
                id="portfolioSize"
                type="number"
                placeholder="e.g., 10000"
                value={portfolioSize}
                onChange={(e) => setPortfolioSize(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your total portfolio value
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dailyBudget">Daily Contract Budget (optional)</Label>
              <Input
                id="dailyBudget"
                type="number"
                placeholder="e.g., 500"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum amount you want to spend per day on contracts
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
    </>
  )
}

