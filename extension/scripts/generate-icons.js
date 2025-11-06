/**
 * Generate simple placeholder icons for the extension
 * In production, replace with proper design assets
 */

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG icons
sizes.forEach(size => {
  const svg = `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#grad)" />
  <text
    x="50%"
    y="50%"
    dominant-baseline="middle"
    text-anchor="middle"
    fill="white"
    font-family="Arial, sans-serif"
    font-weight="bold"
    font-size="${size * 0.6}"
  >M</text>
</svg>
`.trim();

  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
  console.log(`✓ Generated icon${size}.svg`);
});

// Create PNG versions using SVG as base
// Note: For production, use a proper image conversion tool
// For now, we'll just copy SVG and rename (Chrome supports SVG icons in dev)
sizes.forEach(size => {
  const svgPath = path.join(iconsDir, `icon${size}.svg`);
  const pngPath = path.join(iconsDir, `icon${size}.png`);

  // Copy SVG to PNG for now (Chrome will still render it)
  fs.copyFileSync(svgPath, pngPath);
  console.log(`✓ Created icon${size}.png (SVG copy - replace with actual PNG in production)`);
});

console.log('\n✅ All icons generated!');
console.log('📝 Note: For production, replace with proper PNG icons using a design tool or image converter.\n');
