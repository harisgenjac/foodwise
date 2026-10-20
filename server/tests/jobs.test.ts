import cron from "node-cron";
import { startExpirationJob } from "../src/jobs/expireProducts.js";
import { startReminderJob } from "../src/jobs/notificationReminders.js";

// The real job queries are covered in notifications.test.ts; here the database
// is unavailable on purpose, to check scheduling and that failures are only logged.
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("../src/config/db.js", () => {
  const down = () => Promise.reject(new Error("database is down"));
  return { default: { connect: vi.fn(down), query: vi.fn(down), end: vi.fn() } };
});

describe("scheduled jobs", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(cron.schedule).mockClear();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each([
    ["expiration", startExpirationJob, "0 0 * * *", "Error running expiration job:"],
    ["reminder", startReminderJob, "0 7 * * *", "Error running reminder job:"],
  ] as const)("schedules the %s job and logs failures instead of throwing", async (_name, start, expression, log) => {
    start();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const [scheduledAt, task] = vi.mocked(cron.schedule).mock.calls[0]!;
    expect(scheduledAt).toBe(expression);

    // The catch-up run on startup.
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(log, expect.any(Error)));

    // The scheduled run.
    consoleError.mockClear();
    await (task as () => Promise<void>)();
    expect(consoleError).toHaveBeenCalledWith(log, expect.any(Error));
  });
});
