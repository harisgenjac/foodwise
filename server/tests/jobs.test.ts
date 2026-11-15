import cron from "node-cron";
import { startExpirationJob } from "../src/jobs/expireProducts.js";
import { startReminderJob } from "../src/jobs/notificationReminders.js";
import { startCreditRenewalJob } from "../src/jobs/creditRenewals.js";
import { startUploadCleanupJob } from "../src/jobs/cleanupUploads.js";

// The real job queries are covered in notifications.test.ts and creditRequests.test.ts; here the database
// is unavailable on purpose, to check scheduling and that failures are only logged.
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
// One old upload, so the cleanup job reaches the (unavailable) database.
vi.mock("../src/services/storage.js", () => ({
  listStoredFiles: vi.fn(async () => [{ url: "/uploads/products/1-1-ab.png", modifiedAt: new Date(0) }]),
  removeStoredFile: vi.fn(),
}));
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
    ["credit renewal", startCreditRenewalJob, "10 0 * * *", "Error running credit renewal job:"],
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

  it("schedules the upload cleanup without a startup run and logs failures instead of throwing", async () => {
    startUploadCleanupJob();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const [scheduledAt, task] = vi.mocked(cron.schedule).mock.calls[0]!;
    expect(scheduledAt).toBe("30 3 * * *");
    expect(consoleError).not.toHaveBeenCalled();

    await (task as () => Promise<void>)();
    expect(consoleError).toHaveBeenCalledWith("Error running upload cleanup job:", expect.any(Error));
  });
});
