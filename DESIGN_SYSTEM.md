# Options Trader Design System

**Last Updated:** 2025-11-10

This document defines the design system for the Options Trader application. All UI components and features MUST follow these guidelines.

---

## Core Design Principles

### 1. **Minimalist & Professional**
- Clean, uncluttered interfaces
- Information density balanced with whitespace
- Professional trading platform aesthetic
- Dark-first design (default to dark mode)

### 2. **NO ICONS Policy**
- **DO NOT** use Lucide icons or any icon libraries in new features
- Replace icon-based UI with text labels
- Use clear, descriptive text instead of visual symbols
- Exception: Essential navigation elements may use icons sparingly if already established

### 3. **NO EMOJI Policy**
- **DO NOT** use emoji in any UI elements
- No decorative emoji (⭐, 💎, 📊, 🚨, ✓, ⚠️, etc.)
- Use text labels and color coding for visual hierarchy
- Exception: User-generated content may contain emoji

---

## Typography

### Font Families

**Primary (Body Text):**
```css
font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
```

**Display (Headings):**
```css
font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
```

**Monospace (Code/Data):**
```css
font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
```

### Font Scale

- **Headings:** Use Space Grotesk (bold, geometric)
- **Body Text:** Use Inter (clean, readable)
- **Numerical Data:** Use monospace fonts for alignment
- **Small Text:** Use Inter for labels, descriptions, and metadata

### Usage Example

```tsx
// Page title
<h1 className="text-4xl font-bold text-white">
  Stock Fundamentals Scanner
</h1>

// Subtitle
<p className="text-slate-400 text-lg">
  Discover high-quality stock buying opportunities
</p>

// Section heading
<h2 className="text-2xl font-semibold text-white">
  Buy Opportunities
</h2>
```

---

## Color System

### Primary Brand Color: **Emerald**

Use emerald green as the primary accent color throughout the application.

```css
/* Primary Emerald Variants */
--emerald-50:  #ecfdf5;
--emerald-100: #d1fae5;
--emerald-200: #a7f3d0;
--emerald-300: #6ee7b7;  /* Primary accent */
--emerald-400: #34d399;  /* Interactive elements */
--emerald-500: #10b981;  /* Main brand color */
--emerald-600: #059669;
--emerald-700: #047857;
```

### Color Usage Guidelines

**DO:**
- Use emerald for primary actions and highlights
- Use emerald for positive indicators (profits, strong signals)
- Use emerald for interactive states (hover, active, selected)

**DON'T:**
- Use blue, purple, or rainbow gradients
- Use amber/yellow except for neutral states
- Mix multiple brand colors in the same component

### Semantic Colors

| Purpose | Color | Usage |
|---------|-------|-------|
| **Bullish/Positive** | `text-emerald-400` | Gains, strong signals, positive metrics |
| **Bearish/Negative** | `text-red-400` | Losses, weak signals, negative metrics |
| **Neutral** | `text-slate-400` | Default text, labels |
| **Interactive** | `text-emerald-300` | Buttons, links, active states |
| **Background** | `bg-slate-950` | Primary dark background |
| **Card Background** | `bg-slate-900` | Secondary surfaces |
| **Border** | `border-white/10` | Subtle borders |

### Gradient Backgrounds (Subtle Only)

**Allowed:**
```tsx
// Subtle background glow
<div className="absolute -top-32 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
```

**NOT Allowed:**
```tsx
// NO rainbow gradients
<div className="bg-gradient-to-br from-blue-500 to-purple-500" /> // ❌

// NO colorful text gradients
<h1 className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text" /> // ❌
```

---

## Component Patterns

### Buttons

**Primary Button:**
```tsx
<button className="rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-6 py-3 text-sm font-medium transition-all hover:bg-emerald-500/30">
  Action
</button>
```

**Secondary Button:**
```tsx
<button className="rounded-lg bg-white/5 text-slate-300 border border-white/10 px-6 py-3 text-sm font-medium transition-all hover:bg-white/10">
  Action
</button>
```

**Refresh/Action Button:**
```tsx
<button className="rounded-lg bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20 disabled:opacity-50">
  {loading ? 'Loading...' : 'Refresh'}
</button>
```

### Cards

**Standard Card:**
```tsx
<div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
  {/* Content */}
</div>
```

**Emphasized Card:**
```tsx
<div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 p-5">
  {/* Content */}
</div>
```

### Toggle/Tabs

```tsx
<div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
  <button className={`rounded-lg px-6 py-3 text-sm font-medium transition-all ${
    active ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400'
  }`}>
    Option 1
  </button>
</div>
```

### Quality/Status Badges

```tsx
// Excellent
<span className="bg-emerald-500/15 text-emerald-200 border-emerald-400/40 rounded-lg border px-3 py-1 text-xs font-semibold">
  EXCELLENT
</span>

// Good
<span className="bg-emerald-500/10 text-emerald-300 border-emerald-400/30 rounded-lg border px-3 py-1 text-xs font-semibold">
  GOOD
</span>

// Fair/Neutral
<span className="bg-slate-500/15 text-slate-200 border-slate-400/40 rounded-lg border px-3 py-1 text-xs font-semibold">
  FAIR
</span>

// Poor/Warning
<span className="bg-slate-500/10 text-slate-300 border-slate-400/30 rounded-lg border px-3 py-1 text-xs font-semibold">
  WATCH
</span>
```

---

## Layout & Spacing

### Container Widths

```tsx
// Standard page container
<div className="container mx-auto px-4 py-8 max-w-7xl">

// Narrow content
<div className="container mx-auto px-4 py-8 max-w-4xl">
```

### Spacing Scale

Use Tailwind's default spacing scale consistently:
- `gap-2` (8px) - Tight spacing
- `gap-4` (16px) - Standard spacing
- `gap-6` (24px) - Section spacing
- `gap-8` (32px) - Large section spacing

---

## Interactive States

### Text Labels Instead of Icons

**DO:**
```tsx
// Expandable section
<button>
  {expanded ? 'Hide Details' : 'Show Details'}
</button>

// Toggle state
<button>
  {collapsed ? 'Show' : 'Hide'}
</button>

// Loading state
<button>
  {loading ? 'Refreshing...' : 'Refresh'}
</button>
```

**DON'T:**
```tsx
// ❌ NO icon-based UI
<button>
  <ChevronDown /> Show Details
</button>

// ❌ NO emoji indicators
<h3>⭐ Excellent Quality</h3>
```

### Sentiment Indicators

Use text labels, not icons:

```tsx
// Instead of trending icons
{sentiment === 'bullish' && <span className="text-emerald-400">Strong</span>}
{sentiment === 'bearish' && <span className="text-red-400">Weak</span>}
```

---

## Animation & Effects

### Allowed Animations

- Smooth transitions (`transition-all`, `transition-colors`)
- Hover scale effects (subtle, max 1.02x)
- Fade in/out with Framer Motion
- Loading spinners (text-based)

### Loading States

```tsx
// Text-based loading
{loading ? 'Loading...' : 'Content'}

// Animated dots
<div className="flex items-center gap-1">
  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
</div>
```

---

## Glassmorphic Effects

### Background Blur

```tsx
// Standard glass card
<div className="backdrop-blur-sm bg-white/5 border border-white/10">

// Emphasized glass
<div className="backdrop-blur-xl bg-white/10 border border-white/20">
```

### Glow Effects

Use emerald-based glows sparingly:

```tsx
// Subtle card glow
className="shadow-[0_18px_55px_rgba(16,185,129,0.28)]"

// Border glow
className="border-emerald-400/40"
```

---

## Common Mistakes to Avoid

### ❌ DON'T Do This

```tsx
// 1. NO icons
import { TrendingUp, Info, ChevronDown } from 'lucide-react'
<TrendingUp className="h-5 w-5" />

// 2. NO emoji
<h3>⭐ Excellent Quality</h3>
<span>💡 Why Buy:</span>

// 3. NO rainbow gradients
<div className="bg-gradient-to-br from-blue-500 to-purple-500" />
<div className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text" />

// 4. NO mixed brand colors
<span className="text-blue-400">Good</span>
<span className="text-amber-400">Fair</span>

// 5. NO icon-based navigation
<button><ChevronDown /> Show More</button>
```

### ✅ DO This Instead

```tsx
// 1. Use text labels
<h3 className="text-emerald-300">Excellent Quality</h3>

// 2. Use clear text
<span className="font-semibold">Why Buy:</span>

// 3. Use single-color gradients or solid colors
<div className="bg-emerald-500/20" />

// 4. Use consistent emerald brand
<span className="text-emerald-400">Excellent</span>
<span className="text-emerald-300">Good</span>
<span className="text-slate-300">Fair</span>

// 5. Use text for interactive elements
<button className="text-sm">
  {expanded ? 'Hide Details' : 'Show Details'}
</button>
```

---

## Data Visualization

### Score Bars

```tsx
<div className="h-1.5 w-full rounded-full bg-slate-800">
  <div
    className="h-full rounded-full bg-emerald-500"
    style={{ width: `${score}%` }}
  />
</div>
```

### Metrics Display

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <div className="text-xs text-slate-500">Price</div>
    <div className="text-sm font-semibold text-white">${price}</div>
  </div>
</div>
```

---

## File Structure

### Component Organization

```
/components
  /ui              - Base Shadcn/ui components
  /chat-stock-scanner.tsx
  /fundamentals-scanner.tsx
  /navigation.tsx

/app
  /scanner
    /stock-fundamentals  - Unified scanner page
    /chat                - Redirects to unified page
```

---

## Accessibility

- Use semantic HTML (`<button>`, `<nav>`, `<main>`)
- Provide `aria-label` for interactive elements
- Ensure color contrast meets WCAG AA standards
- Use descriptive text instead of icons for clarity

---

## Testing Checklist

When building new features, verify:

- [ ] No Lucide icons imported
- [ ] No emoji in UI elements
- [ ] Colors use emerald (not blue/purple/rainbow)
- [ ] Text labels instead of icon-based UI
- [ ] Typography uses Inter/Space Grotesk
- [ ] Follows glassmorphic card patterns
- [ ] Loading states use text or subtle animations
- [ ] Buttons follow established patterns
- [ ] Spacing uses Tailwind scale consistently

---

## Examples

### ✅ Good Scanner Header

```tsx
<div className="mb-8 text-center">
  <h1 className="text-4xl font-bold text-white mb-3">
    Stock Fundamentals Scanner
  </h1>
  <p className="text-slate-400 text-lg">
    Discover high-quality stock buying opportunities
  </p>
</div>
```

### ✅ Good Quality Badge

```tsx
<span className="bg-emerald-500/15 text-emerald-200 border-emerald-400/40 rounded-lg border px-3 py-1 text-xs font-semibold">
  EXCELLENT
</span>
```

### ✅ Good Interactive Toggle

```tsx
<button
  onClick={() => setViewMode('chat')}
  className={`rounded-lg px-6 py-3 text-sm font-medium transition-all ${
    viewMode === 'chat'
      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      : 'text-slate-400 hover:text-slate-200'
  }`}
>
  Chat Scanner
</button>
```

---

## Version History

- **v1.0.0** (2025-11-10): Initial design system documentation
  - Established no-icon policy
  - Established no-emoji policy
  - Defined emerald as primary brand color
  - Removed rainbow gradients
  - Standardized typography (Inter + Space Grotesk)

---

## Questions?

When in doubt:
1. **Less is more** - Keep it minimal
2. **Text over icons** - Use clear labels
3. **Emerald over rainbow** - Stick to brand colors
4. **Professional over playful** - This is a trading platform

Refer to existing components in `/components/fundamentals-scanner.tsx` and `/components/chat-stock-scanner.tsx` for reference implementations.
