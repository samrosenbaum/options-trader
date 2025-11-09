import { ChatStockScanner } from '@/components/chat-stock-scanner'
import { TrendingUp } from 'lucide-react'

export default function ChatScannerPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">Stock Fundamentals Chat Scanner</h1>
        </div>
        <p className="text-slate-400 text-lg">
          Chat with Monty to discover fundamentally strong companies based on multi-factor analysis
        </p>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-emerald-400">What it scans for:</span> Companies with excellent financial health, strong profitability, consistent growth, reasonable valuations, and manageable debt levels. Perfect for long-term investors seeking quality buy opportunities.
          </p>
        </div>
      </div>

      <ChatStockScanner />
    </div>
  )
}
