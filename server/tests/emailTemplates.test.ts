import { formatPickup, formatQuantity, unitLabel } from "../src/email/templates/format.js";
import { emailTemplate, EMAIL_TEMPLATES } from "../src/email/templates/index.js";
import { escapeHtml, renderLayout } from "../src/email/templates/layout.js";
import { reservationCreated, type ReservationCreatedData } from "../src/email/templates/reservationCreated.js";
import { InvalidEmailDataError } from "../src/email/templates/types.js";

const APP_URL = "https://app.example.com";

const DATA: ReservationCreatedData = {
  reservationId: 42,
  productName: "Piletina <svježa>",
  quantity: "2.50",
  unit: "kg",
  restaurantName: "Restoran Ćevap & Co",
  pickupAt: "2026-11-06T14:30",
};

describe("RESERVATION_CREATED email", () => {
  it("is in Bosnian", () => {
    const email = reservationCreated.render(DATA, "bs", APP_URL);
    expect(email.subject).toBe("Nova rezervacija: 2,5 kg Piletina <svježa>");

    expect(email.html).toContain('<html lang="bs">');
    expect(email.html).toContain(">FoodWise<");
    expect(email.html).toContain("Nova rezervacija</h1>");
    expect(email.html).toContain("Imate novi zahtjev za rezervaciju.");
    expect(email.html).toContain("Količina");
    expect(email.html).toContain("06.11.2026. 14:30");
    expect(email.html).toContain(`href="${APP_URL}/reservation/42"`);
    expect(email.html).toContain(">Otvori rezervaciju</a>");
    expect(email.html).toContain("Ovu poruku ste dobili jer imate račun na platformi FoodWise.");

    expect(email.text).toContain("Nova rezervacija");
    expect(email.text).toContain("Proizvod: Piletina <svježa>");
    expect(email.text).toContain("Količina: 2,5 kg");
    expect(email.text).toContain("Restoran: Restoran Ćevap & Co");
    expect(email.text).toContain("Preuzimanje: 06.11.2026. 14:30");
    expect(email.text).toContain(`Otvori rezervaciju: ${APP_URL}/reservation/42`);
    expect(email.text).toContain("Ovu poruku ste dobili jer imate račun na platformi FoodWise.");
    expect(email.text).not.toContain("<p");
  });

  it("is in English", () => {
    const email = reservationCreated.render({ ...DATA, unit: "kom", quantity: "3.00" }, "en", APP_URL);
    expect(email.subject).toBe("New reservation: 3 pcs Piletina <svježa>");
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain("You have a new reservation request.");
    expect(email.html).toContain(">Open reservation</a>");
    expect(email.html).toContain("06/11/2026 14:30");
    expect(email.html).toContain("You received this email because you have a FoodWise account.");
    expect(email.text).toContain("Quantity: 3 pcs");
    expect(email.text).toContain("Restaurant: Restoran Ćevap & Co");
    expect(email.text).toContain("Pickup: 06/11/2026 14:30");
    expect(email.text).toContain(`Open reservation: ${APP_URL}/reservation/42`);
    expect(email.text).not.toContain("Nova rezervacija");
  });

  it("escapes names in the HTML", () => {
    const email = reservationCreated.render(
      { ...DATA, productName: '<script>alert("x")</script>', restaurantName: "<b>R</b>" },
      "bs",
      APP_URL,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(email.html).toContain("&lt;b&gt;R&lt;/b&gt;");
    expect(reservationCreated.render(DATA, "bs", APP_URL).html).toContain("Restoran Ćevap &amp; Co");
  });

  it("shows a dash for a restaurant without a business name", () => {
    expect(reservationCreated.render({ ...DATA, restaurantName: null }, "bs", APP_URL).text).toContain("Restoran: –");
  });

  it("refuses stored data that does not fit", () => {
    expect(() => reservationCreated.render({ reservationId: "42" }, "bs", APP_URL)).toThrow(InvalidEmailDataError);
    expect(() => reservationCreated.render(null, "bs", APP_URL)).toThrow(
      "The stored data does not match the RESERVATION_CREATED email template.",
    );
  });

  it("is the only notification with an email so far", () => {
    expect(Object.keys(EMAIL_TEMPLATES)).toEqual(["RESERVATION_CREATED"]);
    expect(emailTemplate("RESERVATION_CREATED")).toBe(reservationCreated);
    expect(emailTemplate("RESERVATION_ACCEPTED")).toBeUndefined();
    expect(emailTemplate("toString")).toBeUndefined();
  });
});

describe("layout", () => {
  it("leaves out the details table and keeps the button without details", () => {
    const email = renderLayout({
      lang: "en",
      subject: "Subject",
      heading: "Heading",
      intro: ["First", "Second"],
      button: { label: "Open", url: "https://app.example.com/x?a=1&b=2" },
    });
    expect(email.subject).toBe("Subject");
    expect(email.html).toContain('href="https://app.example.com/x?a=1&amp;b=2"');
    expect(email.html).not.toContain("white-space:nowrap");
    expect(email.text).toBe(
      [
        "FoodWise",
        "",
        "Heading",
        "",
        "First",
        "",
        "Second",
        "",
        "Open: https://app.example.com/x?a=1&b=2",
        "",
        "--",
        "You received this email because you have a FoodWise account.",
        "FoodWise – Još vrijedi",
        "",
      ].join("\n"),
    );
  });

  it("escapes every HTML special character", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("format", () => {
  it("formats quantities per language", () => {
    expect(formatQuantity("4.00", "bs")).toBe("4");
    expect(formatQuantity("2.50", "bs")).toBe("2,5");
    expect(formatQuantity("2.50", "en")).toBe("2.5");
    expect(formatQuantity("abc", "en")).toBe("abc");
  });

  it("names units per language", () => {
    expect(unitLabel("kom", "bs")).toBe("kom");
    expect(unitLabel("kom", "en")).toBe("pcs");
    expect(unitLabel("pak", "en")).toBe("pk");
    expect(unitLabel("kg", "en")).toBe("kg");
    expect(unitLabel("box", "en")).toBe("box");
  });

  it("formats the pickup and leaves out midnight", () => {
    expect(formatPickup("2026-11-06T09:05", "bs")).toBe("06.11.2026. 09:05");
    expect(formatPickup("2026-11-06T09:05", "en")).toBe("06/11/2026 09:05");
    expect(formatPickup("2026-11-06T00:00", "bs")).toBe("06.11.2026.");
    expect(formatPickup("2026-11-06", "en")).toBe("06/11/2026");
    expect(formatPickup("soon", "en")).toBe("soon");
  });
});
