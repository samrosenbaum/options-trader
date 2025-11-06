# 🚀 Quick Start Guide - Monty Chrome Extension

Get Monty up and running on Robinhood in 5 minutes!

## ✅ Prerequisites

1. Google Chrome browser (or any Chromium-based browser like Edge, Brave, Arc)
2. Your options-trader API running locally or deployed

## 📦 Installation Steps

### 1. Load the Extension in Chrome

1. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - OR click the puzzle icon → "Manage Extensions"

2. **Enable Developer Mode:**
   - Toggle "Developer mode" switch in the top-right corner

3. **Load the Extension:**
   - Click "Load unpacked"
   - Navigate to: `/home/user/options-trader/extension/dist`
   - Click "Select Folder"

4. **Verify Installation:**
   - You should see "Monty - AI Options Trading Assistant" in your extensions list
   - The extension icon (green "M") should appear in your toolbar

### 2. Configure API Endpoint

1. **Click the Monty extension icon** in your Chrome toolbar
2. **Enter your API endpoint:**
   - For local development: `http://localhost:3000`
   - For production: Your deployed URL (e.g., `https://your-app.com`)
3. **Ensure "Enable Monty" is toggled ON**
4. **Click "Save Settings"**

### 3. Test on Robinhood

1. **Navigate to Robinhood:**
   - Go to https://robinhood.com and log in
   - Browse to any stock page (e.g., https://robinhood.com/stocks/AAPL)

2. **Look for Monty:**
   - You should see a green circular button in the bottom-right corner
   - This is the Monty assistant!

3. **Start Chatting:**
   - Click the green button to open Monty
   - Try asking: "What's your analysis of this stock?"
   - Monty will have context about the ticker you're viewing!

## 🔧 Troubleshooting

### Extension Not Showing on Robinhood

**Problem:** No green button appears on Robinhood pages

**Solutions:**
1. Refresh the Robinhood page (Ctrl/Cmd + R)
2. Check that the extension is enabled in `chrome://extensions/`
3. Open DevTools (F12) and check Console for errors
4. Try reloading the extension:
   - Go to `chrome://extensions/`
   - Click the reload icon on the Monty extension

### Can't Connect to API

**Problem:** Monty shows "Sorry, I encountered an error"

**Solutions:**
1. **Verify API is running:**
   ```bash
   # In your main options-trader directory
   npm run dev
   ```
   Make sure you see the server running on port 3000

2. **Check API endpoint in settings:**
   - Click Monty extension icon
   - Verify the URL is correct (no trailing slash)

3. **Enable CORS in your API:**

   Add this to `/home/user/options-trader/app/api/chat/route.ts`:
   ```typescript
   // Add CORS headers
   const headers = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
     'Access-Control-Allow-Headers': 'Content-Type',
   };

   // Handle OPTIONS request
   export async function OPTIONS() {
     return new Response(null, { status: 200, headers });
   }

   // Add headers to your POST response
   export async function POST(request: Request) {
     // ... your existing code ...
     return new Response(stream, {
       headers: {
         ...headers,  // Add CORS headers
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
         'Connection': 'keep-alive',
       },
     });
   }
   ```

4. **Check browser console:**
   - Right-click anywhere on Robinhood → "Inspect"
   - Go to "Console" tab
   - Look for red error messages
   - Common errors:
     - CORS error → Fix CORS in your API (see step 3)
     - Network error → Check API is running
     - 404 error → Verify API endpoint URL

### Ticker/Price Not Detected

**Problem:** Monty doesn't recognize what stock you're viewing

**This is expected!** Robinhood's DOM structure is complex and changes frequently. The DOM reader is a best-effort implementation.

**What you can do:**
- Manually tell Monty what you're looking at: "I'm viewing AAPL at $180"
- Monty will still provide valuable analysis

**For developers:**
- The ticker detection logic is in `src/content/robinhood-reader.ts`
- You can update the selectors based on Robinhood's current DOM structure

## 🎯 Usage Tips

### Effective Questions

✅ **Good questions:**
- "Should I buy calls on this stock?"
- "What's your analysis of this option?"
- "Is this a good entry point?"
- "What's the risk/reward here?"

❌ **Less effective:**
- Generic questions without context
- Questions about other tickers (Monty sees what you're viewing)

### Features to Try

1. **Drag the window** - Click and drag the header to reposition
2. **Minimize** - Click the minimize button to collapse
3. **Persistent history** - Your chat history is saved
4. **Context awareness** - Navigate to different stocks, Monty knows!

## 🔄 Making Changes

If you modify the extension code:

1. **Rebuild:**
   ```bash
   cd /home/user/options-trader/extension
   npm run build
   ```

2. **Reload extension:**
   - Go to `chrome://extensions/`
   - Click reload icon on Monty extension

3. **Refresh Robinhood page**

## 📊 What's Next?

Now that Monty is running, try:

1. **Browse different stocks** - See how Monty's context changes
2. **Ask for analysis** - Get AI-powered insights on trades
3. **Compare with main app** - Use Monty as a quick assistant, main app for deep analysis

## 🐛 Still Having Issues?

1. **Check the extension console:**
   - Go to `chrome://extensions/`
   - Click "Inspect views: background page" (if available)
   - OR right-click the extension icon → "Inspect popup"

2. **Check logs:**
   - Open DevTools on Robinhood (F12)
   - Look for messages starting with `[Monty Extension]`

3. **Verify all files are present:**
   ```bash
   ls /home/user/options-trader/extension/dist
   ```
   Should show: manifest.json, content.js, background.js, popup.html, icons/

---

**🎉 Enjoy using Monty on Robinhood!**

For more details, see the full [README.md](./README.md)
