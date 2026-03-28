import "dotenv/config";

export interface ReplConfig {
  navigatorUrl: string;
  navigatorApiKey: string;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(): ReplConfig {
  return {
    navigatorUrl: required("NAVIGATOR_URL", "http://localhost:4006"),
    navigatorApiKey: required("NAVIGATOR_API_KEY", "change-me")
  };
}
