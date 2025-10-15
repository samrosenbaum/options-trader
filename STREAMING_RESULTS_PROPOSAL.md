# Streaming Results Implementation Proposal

## Current State
The scanner processes all symbols and returns complete results after 1-4 minutes. Users see:
1. Monty loading animation
2. Duration warning banner (1-4 minutes)
3. Simulated RealTimeProgress component (not connected to actual scanner)
4. All results appear at once when complete

## Proposed Enhancement: Stream Results As They're Found

### Benefits
- **Better UX**: Users see opportunities as they're discovered
- **Perceived Performance**: Scanner feels faster when results stream in
- **Transparency**: Users see what's being analyzed in real-time
- **Early Action**: High-confidence opportunities surface immediately

### Implementation Approach

#### Option 1: Server-Sent Events (SSE) - Recommended
**Pros:**
- Built into HTTP, no WebSocket complexity
- Works with existing Next.js API routes
- One-way data flow (perfect for our use case)
- Auto-reconnection

**Implementation:**
1. Modify Python scanner to emit JSON progress updates to stdout:
   ```python
   # In enhanced_service.py
   def emit_progress(event_type, data):
       print(json.dumps({
           'type': event_type,
           'data': data,
           'timestamp': datetime.now().isoformat()
       }), flush=True)

   # Usage
   emit_progress('symbol_scanning', {'symbol': 'AAPL'})
   emit_progress('opportunity_found', {
       'symbol': 'AAPL',
       'score': 87,
       'opportunity': {...}
   })
   ```

2. Update API route to stream responses:
   ```typescript
   // app/api/scan-enhanced/route.ts
   export async function POST(request: Request) {
     // Set up SSE headers
     const encoder = new TextEncoder()
     const stream = new ReadableStream({
       start(controller) {
         pythonProcess.stdout.on('data', (data) => {
           const lines = data.toString().split('\\n')
           for (const line of lines) {
             if (line.startsWith('{')) {
               const event = JSON.parse(line)
               controller.enqueue(
                 encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`)
               )
             }
           }
         })
       }
     })

     return new Response(stream, {
       headers: {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
         'Connection': 'keep-alive',
       },
     })
   }
   ```

3. Connect RealTimeProgress component to live stream:
   ```typescript
   // In scanner-page.tsx
   useEffect(() => {
     if (!isLoading) return

     const eventSource = new EventSource('/api/scan-enhanced')

     eventSource.onmessage = (event) => {
       const update = JSON.parse(event.data)

       if (update.type === 'opportunity_found') {
         // Add opportunity to results immediately
         setOpportunities(prev => [...prev, update.data.opportunity])
       }

       // Update RealTimeProgress with actual data
       setScanUpdates(prev => [...prev, {
         symbol: update.data.symbol,
         status: update.type,
         timestamp: update.timestamp
       }])
     }

     return () => eventSource.close()
   }, [isLoading])
   ```

#### Option 2: WebSocket
**Pros:**
- Bidirectional communication (though we don't need it)
- More control over connection

**Cons:**
- More complex setup
- Requires separate WebSocket server or Socket.io
- Not necessary for one-way data flow

#### Option 3: Polling
**Pros:**
- Simplest to implement

**Cons:**
- Not truly real-time
- Higher server load
- Increased latency

### Event Types to Stream

```typescript
interface ScanEvent {
  type: 'scan_started' | 'symbol_scanning' | 'opportunity_found' |
        'symbol_complete' | 'filter_applied' | 'scan_complete' | 'scan_error'
  data: {
    symbol?: string
    score?: number
    opportunity?: Opportunity
    progress?: { current: number, total: number }
    filter?: string
    error?: string
  }
  timestamp: string
}
```

### Phased Rollout

**Phase 1: Progress Updates Only**
- Stream symbol names as they're being analyzed
- Show progress percentage
- No opportunity data yet

**Phase 2: Opportunities as Discovered**
- Stream complete opportunity objects when found
- Display them immediately in the UI
- Sort/filter on client side

**Phase 3: Advanced Streaming**
- Stream partial analysis (score calculated, waiting for Greeks)
- Stream filter decisions (rejected vs passed)
- Stream backtest results as they complete

### Backward Compatibility

Keep existing non-streaming endpoint:
- `/api/scan-enhanced` (SSE streaming) - new
- `/api/scan-enhanced?stream=false` (traditional) - fallback

Fall back to traditional if SSE fails to connect.

### Testing Strategy

1. **Development**: Test with fast symbols (5-10 symbols)
2. **Staging**: Test with full symbol set (50+ symbols)
3. **Production**: A/B test with 10% of users first
4. **Monitoring**: Track:
   - Connection stability
   - Data transfer size
   - User perceived performance
   - Early exit rate (do users close tab less?)

### Estimated Effort

- **Small** (1-2 days): Basic progress streaming (Phase 1)
- **Medium** (3-5 days): Full opportunity streaming (Phase 2)
- **Large** (1-2 weeks): Advanced streaming with all events (Phase 3)

### Alternative: Hybrid Approach

For now, keep the current approach but:
1. ✅ Show duration warning (already implemented)
2. ✅ Show simulated progress (already implemented)
3. Stream final results to show stats incrementally:
   - "Found 5 opportunities so far..."
   - "Analyzed 30/50 symbols..."
   - "Top opportunity: AAPL with 89% score"

This gives users feedback without full streaming implementation.

## Recommendation

**Start with the warning banner** (just implemented) and monitor user behavior:
- Do users wait out the 1-4 minutes?
- Do they reload the page thinking it's stuck?
- What's the abandonment rate?

If abandonment is high, prioritize **Phase 1 SSE streaming** (progress only).
If users are patient, defer streaming to focus on other features.

The infrastructure (RealTimeProgress component) is already built and ready for streaming when needed!
