// Configuration for the Monty extension

// API endpoint - hardcoded for production security
// For development, set VITE_DEV_MODE=true in your environment
const IS_DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

export const API_ENDPOINT = IS_DEV_MODE
  ? 'http://localhost:3000'  // Development
  : 'https://withmonty.com';  // Production (update this to your actual domain)

// Storage keys
export const STORAGE_KEYS = {
  MESSAGES: 'monty_messages',
  POSITIONS: 'monty_positions',
  ENABLED: 'monty_enabled',
} as const;
