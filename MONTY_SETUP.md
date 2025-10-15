# 🐷 Monty the Money Printer Piggy - Setup Guide

Monty will dance while the scanner is running!

## Step 1: Optimize the Video

Your video is currently at:
```
/Users/samrosenbaum/Downloads/Hailuo_Video_Animate this piggy and money p_434597030095597575 (1).mp4
```

### Option A: Quick Setup (Keep Original)
```bash
cd /Users/samrosenbaum/options-trader
mkdir -p public
cp "/Users/samrosenbaum/Downloads/Hailuo_Video_Animate this piggy and money p_434597030095597575 (1).mp4" public/monty.mp4
```

### Option B: Optimized for Web (Recommended)
Use ffmpeg to compress the video for faster loading:
```bash
cd /Users/samrosenbaum/options-trader
mkdir -p public

# Compress to ~500KB (fast loading, good quality)
ffmpeg -i "/Users/samrosenbaum/Downloads/Hailuo_Video_Animate this piggy and money p_434597030095597575 (1).mp4" \
  -vcodec h264 \
  -acodec aac \
  -vf "scale=400:-1" \
  -crf 28 \
  -preset fast \
  public/monty.mp4
```

If you don't have ffmpeg:
```bash
brew install ffmpeg
```

## Step 2: Verify Setup

After copying/optimizing the video:
```bash
# Check that monty.mp4 exists
ls -lh public/monty.mp4

# Should show something like:
# -rw-r--r--  1 user  staff   450K Oct 14 16:30 public/monty.mp4
```

## Step 3: Test It Out

1. Start your dev server (if not already running):
   ```bash
   npm run dev
   ```

2. Go to the scanner page: http://localhost:3000

3. Click "Scan for Opportunities"

4. You should see Monty dancing! 🎉

## How It Works (Zero Performance Impact)

- **Lazy Loaded**: Video only loads when scanner starts, not on page load
- **Client-Side Only**: Video plays in browser, doesn't affect Python scanner
- **Fallback Spinner**: Shows spinner until video loads, so no blank screen
- **Auto-Loop**: Monty keeps dancing until scan completes
- **Mobile Optimized**: `playsInline` attribute prevents fullscreen on mobile

## Troubleshooting

### Video doesn't play
- Check that `public/monty.mp4` exists
- Check browser console for errors (F12 → Console tab)
- Try opening http://localhost:3000/monty.mp4 directly

### Video is too large / slow to load
- Use Option B (ffmpeg compression) above
- Target file size < 500KB for instant loading

### Want to disable Monty temporarily
Edit `app/scanner-page.tsx` line 2681:
```tsx
{/* Temporarily disable Monty */}
{isLoading && (
  <div className="text-center py-16">
    <div className="inline-flex items-center gap-3 text-slate-600 dark:text-slate-400">
      <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-900 dark:border-slate-600 dark:border-t-white rounded-full animate-spin"></div>
      <span className="font-medium">Scanning for opportunities...</span>
    </div>
  </div>
)}
```

## Current Implementation

Files modified:
- ✅ `components/monty-loading.tsx` - Loading component with Monty
- ✅ `app/scanner-page.tsx` - Integrated into scanner page

What you need to do:
- [ ] Copy/optimize video to `public/monty.mp4`
- [ ] Test it works!

Enjoy watching Monty print that money! 💰🐷
