import { loadEmailConfig } from "../src/email/config.js";
import { applyRedirect } from "../src/email/redirect.js";
import {
  createEmailTransport,
  createLogTransport,
  createResendTransport,
  createSmtpTransport,
  RESEND_API_URL,
  type EmailMessage,
  type SmtpClientFactory,
} from "../src/email/transports.js";

const MESSAGE: EmailMessage = {
  from: "FoodWise <no-reply@example.com>",
  to: "store@example.com",
  subject: "Nova rezervacija: 4 kg Piletina",
  html: "<p>Hello</p>",
  text: "Hello",
};

describe("applyRedirect", () => {
  it("leaves the email alone without a redirect", () => {
    expect(applyRedirect(MESSAGE, null)).toBe(MESSAGE);
  });

  it("sends to the redirect address and names the real recipient in the subject", () => {
    const redirected = applyRedirect(MESSAGE, "inbox@example.com");
    expect(redirected).toEqual({
      ...MESSAGE,
      to: "inbox@example.com",
      subject: "[to: store@example.com] Nova rezervacija: 4 kg Piletina",
    });
    // The original is not changed.
    expect(MESSAGE.to).toBe("store@example.com");
  });
});

describe("log transport", () => {
  it("only writes the email to the log", async () => {
    const log = vi.fn();
    await createLogTransport(log).send(MESSAGE);
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0] as string;
    expect(line).toContain("Not sent (EMAIL_PROVIDER=log)");
    expect(line).toContain("To: store@example.com");
    expect(line).toContain("Subject: Nova rezervacija: 4 kg Piletina");
    expect(line).toContain("Hello");
  });
});

describe("smtp transport", () => {
  const fakeClient = (sendMail = vi.fn().mockResolvedValue({ messageId: "1" })) => {
    const factory = vi.fn<SmtpClientFactory>(() => ({ sendMail }));
    return { factory, sendMail };
  };

  it("connects without TLS on Mailpit's port and passes the email through", async () => {
    const { factory, sendMail } = fakeClient();
    const transport = createSmtpTransport({ host: "localhost", port: 1025 }, factory);
    expect(transport.name).toBe("smtp");
    expect(factory).toHaveBeenCalledWith({ host: "localhost", port: 1025, secure: false });
    await transport.send(MESSAGE);
    expect(sendMail).toHaveBeenCalledWith(MESSAGE);
  });

  it("uses TLS on port 465", () => {
    const { factory } = fakeClient();
    createSmtpTransport({ host: "smtp.example.com", port: 465 }, factory);
    expect(factory).toHaveBeenCalledWith({ host: "smtp.example.com", port: 465, secure: true });
  });

  it("throws when the server refuses the email", async () => {
    const { factory } = fakeClient(vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:1025")));
    await expect(createSmtpTransport({ host: "localhost", port: 1025 }, factory).send(MESSAGE)).rejects.toThrow(
      "ECONNREFUSED",
    );
  });
});

describe("resend transport", () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("posts the email to the Resend API with the key and the idempotency key", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { id: "abc" }));
    const transport = createResendTransport({ apiKey: "re_test_key" }, fetchFn);
    expect(transport.name).toBe("resend");
    await transport.send(MESSAGE, { idempotencyKey: "foodwise-email-7" });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(RESEND_API_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "Idempotency-Key": "foodwise-email-7",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      from: MESSAGE.from,
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no idempotency key when none is given", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { id: "abc" }));
    await createResendTransport({ apiKey: "re_test_key" }, fetchFn).send(MESSAGE);
    expect(fetchFn.mock.calls[0]![1]?.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("throws Resend's error message on a refused email", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(403, { statusCode: 403, name: "validation_error", message: "The domain is not verified." }));
    await expect(createResendTransport({ apiKey: "re_test_key" }, fetchFn).send(MESSAGE)).rejects.toThrow(
      "Resend responded with 403: The domain is not verified.",
    );
  });

  it("throws the status text when the error is not JSON", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream down", { status: 502, statusText: "Bad Gateway" }));
    await expect(createResendTransport({ apiKey: "re_test_key" }, fetchFn).send(MESSAGE)).rejects.toThrow(
      "Resend responded with 502: Bad Gateway",
    );
  });

  it("throws when the request itself fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createResendTransport({ apiKey: "re_test_key" }, fetchFn).send(MESSAGE)).rejects.toThrow(
      "fetch failed",
    );
  });
});

describe("createEmailTransport", () => {
  it("picks the transport from EMAIL_PROVIDER", () => {
    expect(createEmailTransport(loadEmailConfig({})).name).toBe("log");
    expect(createEmailTransport(loadEmailConfig({ EMAIL_PROVIDER: "smtp" })).name).toBe("smtp");
    expect(
      createEmailTransport(
        loadEmailConfig({
          EMAIL_PROVIDER: "resend",
          EMAIL_FROM: "no-reply@example.com",
          RESEND_API_KEY: "re_test_key",
          EMAIL_REDIRECT_TO: "inbox@example.com",
        }),
      ).name,
    ).toBe("resend");
  });
});
