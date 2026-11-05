import {
  DEFAULT_EMAIL_FROM,
  DEFAULT_SMTP_PORT,
  EmailConfigError,
  loadEmailConfig,
} from "../src/email/config.js";

// The startup test imports server.ts with everything it starts mocked.
vi.mock("../src/app.js", () => ({ default: { listen: vi.fn() } }));
vi.mock("../src/jobs/expireProducts.js", () => ({ startExpirationJob: vi.fn() }));
vi.mock("../src/jobs/notificationReminders.js", () => ({ startReminderJob: vi.fn() }));
vi.mock("../src/jobs/creditRenewals.js", () => ({ startCreditRenewalJob: vi.fn() }));
vi.mock("../src/email/queue.js", () => ({ startEmailWorker: vi.fn() }));

const RESEND = {
  EMAIL_PROVIDER: "resend",
  EMAIL_FROM: "FoodWise <no-reply@example.com>",
  RESEND_API_KEY: "re_test_key",
};

describe("loadEmailConfig", () => {
  it("defaults to the log transport when nothing is set", () => {
    expect(loadEmailConfig({})).toEqual({
      provider: "log",
      from: DEFAULT_EMAIL_FROM,
      redirectTo: null,
      appUrl: "http://localhost:5173",
      smtp: null,
      resend: null,
    });
  });

  it("treats empty and whitespace-only variables as not set", () => {
    const config = loadEmailConfig({ EMAIL_PROVIDER: " ", EMAIL_FROM: "", EMAIL_REDIRECT_TO: "  " });
    expect(config.provider).toBe("log");
    expect(config.from).toBe(DEFAULT_EMAIL_FROM);
    expect(config.redirectTo).toBeNull();
  });

  it("refuses an unknown provider", () => {
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: "sendgrid" })).toThrow(
      'EMAIL_PROVIDER must be one of log, smtp, resend, got "sendgrid".',
    );
  });

  it("links to the first CLIENT_ORIGIN without a trailing slash", () => {
    expect(loadEmailConfig({ CLIENT_ORIGIN: "https://app.example.com/, https://preview.example.com" }).appUrl).toBe(
      "https://app.example.com",
    );
  });

  it("uses Mailpit's address for smtp by default and reads SMTP_HOST and SMTP_PORT", () => {
    expect(loadEmailConfig({ EMAIL_PROVIDER: "smtp" }).smtp).toEqual({ host: "localhost", port: DEFAULT_SMTP_PORT });
    expect(loadEmailConfig({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "mailpit", SMTP_PORT: "2525" }).smtp).toEqual({
      host: "mailpit",
      port: 2525,
    });
  });

  it.each(["abc", "0", "70000", "25.5", "-1"])("refuses SMTP_PORT=%s", (port) => {
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: "smtp", SMTP_PORT: port })).toThrow(EmailConfigError);
  });

  it("checks EMAIL_FROM and EMAIL_REDIRECT_TO", () => {
    expect(loadEmailConfig({ EMAIL_FROM: "no-reply@example.com" }).from).toBe("no-reply@example.com");
    expect(() => loadEmailConfig({ EMAIL_FROM: "FoodWise" })).toThrow('EMAIL_FROM is not a valid sender: "FoodWise".');
    expect(() => loadEmailConfig({ EMAIL_FROM: "FoodWise <nobody>" })).toThrow(EmailConfigError);
    expect(loadEmailConfig({ EMAIL_REDIRECT_TO: " Inbox@Example.com " }).redirectTo).toBe("inbox@example.com");
    expect(() => loadEmailConfig({ EMAIL_REDIRECT_TO: "not-an-email" })).toThrow(
      'EMAIL_REDIRECT_TO is not a valid email address: "not-an-email".',
    );
  });

  it("requires RESEND_API_KEY and EMAIL_FROM for resend", () => {
    const { RESEND_API_KEY: _key, ...withoutKey } = RESEND;
    expect(() => loadEmailConfig({ ...withoutKey, NODE_ENV: "production" })).toThrow(
      "RESEND_API_KEY is required with EMAIL_PROVIDER=resend.",
    );
    const { EMAIL_FROM: _from, ...withoutFrom } = RESEND;
    expect(() => loadEmailConfig({ ...withoutFrom, NODE_ENV: "production" })).toThrow(
      "EMAIL_FROM is required with EMAIL_PROVIDER=resend.",
    );
  });

  describe("safety rule: resend outside production needs EMAIL_REDIRECT_TO", () => {
    it.each([undefined, "development", "test", "staging"])("refuses it with NODE_ENV=%s", (nodeEnv) => {
      const env = nodeEnv === undefined ? RESEND : { ...RESEND, NODE_ENV: nodeEnv };
      expect(() => loadEmailConfig(env)).toThrow(
        "EMAIL_PROVIDER=resend outside production requires EMAIL_REDIRECT_TO, so no real person gets an email.",
      );
    });

    it("allows it outside production with a redirect", () => {
      const config = loadEmailConfig({ ...RESEND, NODE_ENV: "development", EMAIL_REDIRECT_TO: "me@example.com" });
      expect(config).toMatchObject({
        provider: "resend",
        redirectTo: "me@example.com",
        resend: { apiKey: "re_test_key" },
      });
    });

    it("allows it in production without a redirect (going live)", () => {
      const config = loadEmailConfig({ ...RESEND, NODE_ENV: "production" });
      expect(config).toMatchObject({ provider: "resend", redirectTo: null });
    });

    it("does not apply to smtp or log", () => {
      expect(loadEmailConfig({ EMAIL_PROVIDER: "smtp" }).redirectTo).toBeNull();
      expect(loadEmailConfig({ EMAIL_PROVIDER: "log" }).redirectTo).toBeNull();
    });
  });
});

describe("server startup", () => {
  const NAMES = ["EMAIL_PROVIDER", "EMAIL_FROM", "EMAIL_REDIRECT_TO", "RESEND_API_KEY", "SMTP_HOST", "SMTP_PORT"];
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

  it("refuses to start with resend outside production and no EMAIL_REDIRECT_TO", async () => {
    Object.assign(process.env, RESEND);
    await expect(import("../src/server.js")).rejects.toThrow("process.exit(1)");
    expect(consoleError).toHaveBeenCalledWith(
      "Email configuration error: EMAIL_PROVIDER=resend outside production requires EMAIL_REDIRECT_TO, so no real person gets an email.",
    );
    const app = (await import("../src/app.js")).default;
    expect(app.listen).not.toHaveBeenCalled();
    const { startEmailWorker } = await import("../src/email/queue.js");
    expect(startEmailWorker).not.toHaveBeenCalled();
  });

  it("starts with resend and a redirect, and starts the email worker", async () => {
    Object.assign(process.env, RESEND, { EMAIL_REDIRECT_TO: "inbox@example.com" });
    await import("../src/server.js");
    expect(exit).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith("Emails: resend, every email redirected to inbox@example.com");
    const { startEmailWorker } = await import("../src/email/queue.js");
    expect(startEmailWorker).toHaveBeenCalledWith(expect.objectContaining({ provider: "resend" }));
    const app = (await import("../src/app.js")).default;
    expect(app.listen).toHaveBeenCalled();
  });

  it("starts with the log transport when nothing is configured", async () => {
    await import("../src/server.js");
    expect(exit).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith("Emails: log");
  });
});
