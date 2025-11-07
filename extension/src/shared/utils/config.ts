// Configuration for the Monty extension

// API endpoint - update this with your deployed URL or local dev server
export const API_ENDPOINT = process.env.API_ENDPOINT || 'https://www.withmonty.com';

// Storage keys
export const STORAGE_KEYS = {
  MESSAGES: 'monty_messages',
  API_ENDPOINT: 'monty_api_endpoint',
  ENABLED: 'monty_enabled',
} as const;
