import {
  DEV_WEBHOOK_SECRET,
  DeliveryConfigError,
  createDeliveryProvider,
  loadDeliveryConfig,
} from "../src/delivery/config.js";
import { MockProvider } from "../src/delivery/mock.js";

// The startup test imports server.ts with everything it starts mocked.
vi.mock("../src/app.js", () => ({ default: { listen: vi.fn() } }));
vi.mock("../src/jobs/expireProducts.js", () => ({ startExpirationJob: vi.fn() }));
vi.mock("../src/jobs/notificationReminders.js", () => ({ startReminderJob: vi.fn() }));
vi.mock("../src/jobs/creditRenewals.js", () => ({ startCreditRenewalJob: vi.fn() }));
vi.mock("../src/jobs/cleanupUploads.js", () => ({ startUploadCleanupJob: vi.fn() }));
vi.mock("../src/email/queue.js", () => ({ startEmailWorker: vi.fn() }));

describe("loadDeliveryConfig", () => {
  it("defaults to the mock with the development secret", () => {
    expect(loadDeliveryConfig({})).toEqual({ provider: "mock", webhookSecret: DEV_WEBHOOK_SECRET });
    expect(loadDeliveryConfig({ DELIVERY_PROVIDER: " ", DELIVERY_WEBHOOK_SECRET: "" }).provider).toBe("mock");
  });

  it("refuses an unknown provider", () => {
    expect(() => loadDeliveryConfig({ DELIVERY_PROVIDER: "korpa" })).toThrow(
      'DELIVERY_PROVIDER must be one of mock, got "korpa".',
    );
  });

  it("reads the webhook secret and refuses a short one", () => {
    expect(loadDeliveryConfig({ DELIVERY_WEBHOOK_SECRET: " a-long-enough-secret " }).webhookSecret).toBe(
      "a-long-enough-secret",
    );
    expect(() => loadDeliveryConfig({ DELIVERY_WEBHOOK_SECRET: "short" })).toThrow(
      "DELIVERY_WEBHOOK_SECRET must be at least 16 characters long.",
    );
  });

  it("requires the secret in production", () => {
    expect(() => loadDeliveryConfig({ NODE_ENV: "production" })).toThrow(
      "DELIVERY_WEBHOOK_SECRET is required in production.",
    );
    expect(
      loadDeliveryConfig({ NODE_ENV: "production", DELIVERY_WEBHOOK_SECRET: "a-long-enough-secret" }).webhookSecret,
    ).toBe("a-long-enough-secret");
  });

  it("creates the mock provider", () => {
    const provider = createDeliveryProvider({ provider: "mock", webhookSecret: DEV_WEBHOOK_SECRET });
    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.name).toBe("mock");
  });
});

describe("server startup", () => {
  const NAMES = ["DELIVERY_PROVIDER", "DELIVERY_WEBHOOK_SECRET", "EMAIL_PROVIDER"];
  const saved: Record<string, string | undefined> = {};
  let exit: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const name of NAMES) saved[name] = process.env[name];
    // Set to empty (= not set) rather than deleted, so dotenv cannot fill them from server/.env.
    for (const name of NAMES) process.env[name] = "";
    vi.resetModules();
    exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const name of NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    exit.mockRestore();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it("refuses to start with an unknown delivery provider", async () => {
    process.env.DELIVERY_PROVIDER = "unknown";
    await expect(import("../src/server.js")).rejects.toThrow("process.exit(1)");
    expect(consoleError).toHaveBeenCalledWith(
      'Delivery configuration error: DELIVERY_PROVIDER must be one of mock, got "unknown".',
    );
    const app = (await import("../src/app.js")).default;
    expect(app.listen).not.toHaveBeenCalled();
  });

  it("starts with the mock when nothing is configured", async () => {
    await import("../src/server.js");
    expect(exit).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith("Delivery: mock");
    const app = (await import("../src/app.js")).default;
    expect(app.listen).toHaveBeenCalled();
  });
});
