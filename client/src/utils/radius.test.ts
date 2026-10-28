import i18n from "../i18n/config.js";
import { formatCityDistance, nextRadius, widenLabel } from "./radius.js";

const t = i18n.t.bind(i18n);

describe("radius helpers", () => {
  it("widens one step at a time, 5 → 10 → 20 → 50 → all", () => {
    expect(nextRadius("5")).toBe("10");
    expect(nextRadius("10")).toBe("20");
    expect(nextRadius("20")).toBe("50");
    expect(nextRadius("50")).toBe("all");
    expect(nextRadius("all")).toBe("all");
  });

  it("labels the widen button with the next radius, or all cities after 50 km", () => {
    expect(widenLabel(t, "5")).toBe("Prikaži do 10 km");
    expect(widenLabel(t, "20")).toBe("Prikaži do 50 km");
    expect(widenLabel(t, "50")).toBe("Prikaži sve gradove");
  });

  it("shows the city with the distance, the own city in words, and only the city without one", async () => {
    expect(formatCityDistance(t, "Kakanj", 16)).toBe("Kakanj · 16 km");
    expect(formatCityDistance(t, "Visoko", 0)).toBe("Visoko · u vašem gradu");
    expect(formatCityDistance(t, "Zenica", null)).toBe("Zenica");
    expect(formatCityDistance(t, "Zenica", undefined)).toBe("Zenica");

    await i18n.changeLanguage("en");
    expect(formatCityDistance(t, "Visoko", 0)).toBe("Visoko · in your city");
  });
});
