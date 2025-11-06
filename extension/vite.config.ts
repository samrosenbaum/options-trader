import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Plugin to copy static files
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // Ensure dist directory exists
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // Copy public files
      const publicDir = resolve(__dirname, 'public');
      if (existsSync(publicDir)) {
        const publicFiles = ['popup.html', 'popup.js', 'monty-avatar.png'];
        publicFiles.forEach(file => {
          const src = resolve(publicDir, file);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distDir, file));
          }
        });

        // Copy icons directory if it exists
        const iconsDir = resolve(publicDir, 'icons');
        const distIconsDir = resolve(distDir, 'icons');
        if (existsSync(iconsDir)) {
          if (!existsSync(distIconsDir)) {
            mkdirSync(distIconsDir, { recursive: true });
          }
          // Copy all icon files
          const iconFiles = ['icon16.png', 'icon48.png', 'icon128.png'];
          iconFiles.forEach(iconFile => {
            const src = resolve(iconsDir, iconFile);
            if (existsSync(src)) {
              copyFileSync(src, resolve(distIconsDir, iconFile));
            }
          });
        }
      }

      console.log('✓ Static files copied to dist/');
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/content-script.tsx'),
        background: resolve(__dirname, 'src/background/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
