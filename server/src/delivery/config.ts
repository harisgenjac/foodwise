import { MockProvider } from "./mock.js";
import { DELIVERY_PROVIDERS, type DeliveryProvider, type DeliveryProviderName } from "./types.js";

// Delivery settings, read from the environment once at startup (server.ts). Phase 3 adds
// DELIVERY_PROVIDER=korpa with its URL and API key.
export interface DeliveryConfig {
  provider: DeliveryProviderName;
  // The shared secret of the webhook signature (see signature.ts).
  webhookSecret: string;
}

export class DeliveryConfigError extends Error {}

// Only for the mock outside production: a real provider always needs its own secret.
export const DEV_WEBHOOK_SECRET = "josvrijedi-mock-webhook-secret";
const MIN_SECRET_LENGTH = 16;

const read = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const value = env[name]?.trim();
  return value ? value : null;
};

// Throws DeliveryConfigError for a setting that is not valid; the server refuses to start with it.
export const loadDeliveryConfig = (env: NodeJS.ProcessEnv = process.env): DeliveryConfig => {
  const providerValue = read(env, "DELIVERY_PROVIDER") ?? "mock";
  if (!(DELIVERY_PROVIDERS as readonly string[]).includes(providerValue)) {
    throw new DeliveryConfigError(
      `DELIVERY_PROVIDER must be one of ${DELIVERY_PROVIDERS.join(", ")}, got "${providerValue}".`,
    );
  }
  const provider = providerValue as DeliveryProviderName;

  const secret = read(env, "DELIVERY_WEBHOOK_SECRET");
  if (secret === null && env.NODE_ENV === "production") {
    throw new DeliveryConfigError("DELIVERY_WEBHOOK_SECRET is required in production.");
  }
  if (secret !== null && secret.length < MIN_SECRET_LENGTH) {
    throw new DeliveryConfigError(`DELIVERY_WEBHOOK_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }
  return { provider, webhookSecret: secret ?? DEV_WEBHOOK_SECRET };
};

export const createDeliveryProvider = (config: DeliveryConfig): DeliveryProvider => {
  switch (config.provider) {
    case "mock":
      return new MockProvider({ webhookSecret: config.webhookSecret });
  }
};

// One provider for the whole process, so the mock's deliveries are shared by every request.
let provider: DeliveryProvider | null = null;

export const getDeliveryProvider = (): DeliveryProvider => {
  provider ??= createDeliveryProvider(loadDeliveryConfig());
  return provider;
};
