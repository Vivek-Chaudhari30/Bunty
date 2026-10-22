// Router settings, read once from the environment. Secret values never get logged.
import { NotConfiguredError } from "./errors.ts";

export interface RouterConfig {
  port: number;
  dbPath: string;
  /** Public URL Twilio and Meta use to reach the router, e.g. https://router.example.com */
  publicBaseUrl: string;
  /** Sign-up page sent to unknown numbers. */
  onboardingUrl: string;
  whatsappAppSecret: string;
  whatsappVerifyToken: string;
  twilioAuthToken: string;
  internalHmacKey: string;
}

const REQUIRED = [
  ["ROUTER_WHATSAPP_APP_SECRET", "Meta webhook signature check"],
  ["ROUTER_WHATSAPP_VERIFY_TOKEN", "Meta webhook verification"],
  ["ROUTER_TWILIO_AUTH_TOKEN", "Twilio signature check"],
  ["ROUTER_INTERNAL_HMAC_KEY", "signed calls from assistants"],
  ["ROUTER_PUBLIC_BASE_URL", "public router URL (Twilio signs it)"],
] as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): RouterConfig {
  for (const [name, what] of REQUIRED) {
    if (!env[name]) throw new NotConfiguredError(name, what);
  }
  return {
    port: Number(env.ROUTER_PORT ?? 8787),
    dbPath: env.ROUTER_DB_PATH ?? "router.db",
    publicBaseUrl: env.ROUTER_PUBLIC_BASE_URL!.replace(/\/+$/, ""),
    onboardingUrl: env.ROUTER_ONBOARDING_URL ?? "https://website-seven-xi-36.vercel.app",
    whatsappAppSecret: env.ROUTER_WHATSAPP_APP_SECRET!,
    whatsappVerifyToken: env.ROUTER_WHATSAPP_VERIFY_TOKEN!,
    twilioAuthToken: env.ROUTER_TWILIO_AUTH_TOKEN!,
    internalHmacKey: env.ROUTER_INTERNAL_HMAC_KEY!,
  };
}
