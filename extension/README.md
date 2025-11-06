# Monty Chrome Extension

A floating AI assistant that overlays on Robinhood to provide real-time options trading analysis.

## Features

- 🎯 **Auto-detects** what you're viewing on Robinhood
- 💬 **Real-time chat** with Monty AI assistant
- 📊 **Context-aware** analysis based on current stock/option
- 🎨 **Draggable overlay** - position it anywhere on screen
- 💾 **Persistent chat** history across sessions
- ⚡ **Streaming responses** for instant feedback

## Installation

### Development Setup

1. **Install dependencies:**
   ```bash
   cd extension
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension/dist` folder

4. **Configure API endpoint:**
   - Click the Monty extension icon
   - Enter your API endpoint (e.g., `http://localhost:3000` for local dev)
   - Click "Save Settings"

5. **Visit Robinhood:**
   - Go to https://robinhood.com
   - You should see the Monty floating button in the bottom-right corner!

### Development Mode (with hot reload)

```bash
npm run dev
```

This will watch for changes and rebuild automatically. You'll need to click the "Reload" button in `chrome://extensions/` after each build.

## Usage

1. **Open Robinhood** and navigate to any stock or option
2. **Click the Monty button** (green circle in bottom-right)
3. **Ask questions** about the stock/option you're viewing
4. **Drag the window** by clicking and dragging the header
5. **Minimize** using the minimize button in the header

### Example Questions

- "Should I buy calls on this stock?"
- "What's the IV rank on this option?"
- "Analyze this trade for me"
- "What's your take on this strike price?"

## Architecture

```
extension/
├── src/
│   ├── shared/              # Reusable components
│   │   ├── components/
│   │   │   └── MontyOverlay.tsx    # Main floating overlay
│   │   ├── api/
│   │   ├── types/
│   │   └── utils/
│   ├── content/             # Content scripts (injected into pages)
│   │   ├── content-script.tsx      # Main injection point
│   │   └── robinhood-reader.ts     # DOM reader for Robinhood
│   └── background/          # Background service worker
│       └── background.ts
├── public/                  # Static assets
│   ├── popup.html
│   ├── popup.js
│   └── icons/
└── manifest.json
```

## Tech Stack

- **React 18** - UI components
- **TypeScript** - Type safety
- **Framer Motion** - Smooth animations
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Chrome Extension Manifest V3** - Latest extension format

## API Integration

The extension connects to your main options-trader app's `/api/chat` endpoint. Make sure:

1. Your API server is running
2. CORS is enabled for the extension origin
3. The API endpoint is configured in extension settings

### CORS Configuration

Add this to your Next.js API route (`app/api/chat/route.ts`):

```typescript
// Allow extension origin
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

## Troubleshooting

### Extension not appearing on Robinhood
- Check that the extension is enabled in `chrome://extensions/`
- Reload the Robinhood page
- Check browser console for errors

### Can't connect to API
- Verify the API endpoint in extension settings
- Make sure your API server is running
- Check that CORS is properly configured
- Open browser DevTools > Network tab to see failed requests

### Monty not detecting ticker/price
- Robinhood's DOM structure may have changed
- Check the `robinhood-reader.ts` selectors
- Open an issue with details about what's not being detected

## Future Enhancements

- [ ] Firefox extension support
- [ ] Bookmarklet version (works in any browser)
- [ ] Screenshot analysis
- [ ] Position tracking integration
- [ ] Quick actions (add to watchlist, etc.)

## Contributing

This extension is part of the main options-trader project. To contribute:

1. Make changes in the `extension/` folder
2. Test locally
3. Submit a PR to the main repo

## License

MIT
