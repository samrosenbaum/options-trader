# Monty Chrome Extension

A floating AI assistant that overlays on Robinhood to provide real-time options trading analysis.

## Features

- 🎯 **Auto-detects** what you're viewing on Robinhood
- 💬 **Real-time chat** with Monty AI assistant
- 📊 **Context-aware** analysis based on current stock/option
- 📸 **Vision-powered** position detection via screenshots
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

4. **Visit Robinhood:**
   - Go to https://robinhood.com
   - You should see the Monty floating button in the bottom-right corner!

### Development Mode

**For local development** (connecting to localhost:3000 instead of production):

1. Create a `.env` file in the `extension/` directory:
   ```env
   VITE_DEV_MODE=true
   ```

2. Build or run dev mode:
   ```bash
   npm run build
   # OR for hot reload:
   npm run dev
   ```

This will use `http://localhost:3000` instead of the production API. The production build (without `VITE_DEV_MODE=true`) uses the hardcoded production URL for security.

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

The extension connects to the production API at `https://withmonty.com/api/chat` by default.

**For production users:** No configuration needed - the extension automatically uses the production API.

**For developers:** Set `VITE_DEV_MODE=true` in `.env` to use `http://localhost:3000` during development.

### Security Note

The API endpoint is **hardcoded** in production builds to ensure:
- Users always connect to the official API
- Your Anthropic API key remains secure on the backend
- Consistent experience for all users
- No unauthorized API usage

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

- [x] **Screenshot analysis** - Vision-powered position detection ✅
- [ ] Firefox extension support
- [ ] Bookmarklet version (works in any browser)
- [ ] User profile & preferences
- [ ] Position tracking history
- [ ] Quick actions (add to watchlist, etc.)

## Contributing

This extension is part of the main options-trader project. To contribute:

1. Make changes in the `extension/` folder
2. Test locally
3. Submit a PR to the main repo

## License

MIT
