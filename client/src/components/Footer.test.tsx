import { screen, waitFor } from "@testing-library/react";
import Footer from "./Footer.js";
import i18n from "../i18n/config.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";

describe("Footer", () => {
  const renderFooter = (impact: unknown, showImpact?: boolean) =>
    renderWithProviders(<Footer showImpact={showImpact} />, { user: makeUser(), get: { "/stats/impact": impact } });

  it("renders the links, the year and the version", async () => {
    renderFooter({ kg: 0 });

    for (const key of ["help", "contact", "terms", "privacy"]) {
      expect(screen.getByText(t(`footer.${key}`))).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: t("footer.contact") })).toHaveAttribute(
      "href",
      "mailto:foodwize@testing.com",
    );
    // Their pages do not exist yet, so they are plain text.
    for (const key of ["help", "terms", "privacy"]) {
      expect(screen.queryByRole("link", { name: t(`footer.${key}`) })).not.toBeInTheDocument();
    }
    expect(screen.getByText(`© ${new Date().getFullYear()} FoodWise · Još vrijedi`)).toBeInTheDocument();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/stats/impact"));
  });

  it("shows the food saved, rounded and formatted for Bosnian", async () => {
    renderFooter({ kg: 12479.6 });
    expect(await screen.findByText(t("footer.impact", { kg: "12.480" }))).toBeInTheDocument();
  });

  it("formats the food saved for English", async () => {
    await i18n.changeLanguage("en");
    renderFooter({ kg: 12480 });
    expect(await screen.findByText("Together we have saved 12,480 kg of food")).toBeInTheDocument();
  });

  it("hides the counter at 0", async () => {
    renderFooter({ kg: 0 });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/stats/impact"));
    expect(screen.queryByText(/kg hrane/)).not.toBeInTheDocument();
  });

  it("hides the counter when the request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderFooter(axiosError(500, "An error occurred while fetching impact statistics."));
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.queryByText(/kg hrane/)).not.toBeInTheDocument();
  });

  it("makes no request without the counter", async () => {
    renderFooter({ kg: 500 }, false);
    expect(screen.getByText(t("footer.help"))).toBeInTheDocument();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/users/me"));
    expect(apiMock.get).not.toHaveBeenCalledWith("/stats/impact");
    expect(screen.queryByText(/kg hrane/)).not.toBeInTheDocument();
  });
});
