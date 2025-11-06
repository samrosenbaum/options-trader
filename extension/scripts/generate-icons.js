/**
 * Generate extension icons from Monty avatar
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const sourceAvatar = path.join(__dirname, '..', '..', 'public', 'monty-avatar.png');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Check if source exists
if (!fs.existsSync(sourceAvatar)) {
  console.error('❌ Monty avatar not found at:', sourceAvatar);
  process.exit(1);
}

console.log('🎨 Generating extension icons from Monty avatar...\n');

// Generate PNG icons at different sizes
async function generateIcons() {
  try {
    for (const size of sizes) {
      const outputPath = path.join(iconsDir, `icon${size}.png`);

      await sharp(sourceAvatar)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated icon${size}.png`);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('📝 Using the official Monty avatar for extension icons.\n');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
