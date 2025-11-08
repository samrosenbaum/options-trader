import { ChatStockScanner } from '@/components/chat-stock-scanner'

export default function ChatScannerPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold text-white">Chat with Monty</h1>
        <p className="text-slate-400">
          Discover stocks by chatting with your AI investing buddy 💬
        </p>
      </div>

      <ChatStockScanner />
    </div>
  )
}
