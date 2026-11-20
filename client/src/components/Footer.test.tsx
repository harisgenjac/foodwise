import { fireEvent, screen, within } from "@testing-library/react";
import Footer, { FOOTER_INFO_LINKS, FOOTER_LEGAL_LINKS, FOOTER_SOCIAL_LINKS } from "./Footer.js";
import i18n from "../i18n/config.js";
import { apiMock, makeUser, renderWithProviders, t } from "../test/utils.js";

describe("Footer", () => {
  const renderFooter = (props: { flush?: boolean; bottomNavSpace?: boolean } = {}) =>
    renderWithProviders(<Footer {...props} />, { route: "/orders", path: "/orders", user: makeUser() });

  it("shows the logo, the information and legal links, the social accounts and the copyright", () => {
    renderFooter();

    expect(screen.getByRole("link", { name: t("footer.home") })).toHaveAttribute("href", "/dashboard");
    const info = screen.getByRole("navigation", { name: t("footer.infoLabel") });
    expect(within(info).getAllByRole("link").map((link) => link.textContent)).toEqual(
      FOOTER_INFO_LINKS.map(({ key }) => t(`footer.${key}`)),
    );
    expect(within(info).getAllByRole("link").map((link) => link.textContent)).toEqual(["O nama", "Podrška", "Kontakt", "Postani partner"]);
    const legal = screen.getByRole("navigation", { name: t("footer.legalLabel") });
    expect(within(legal).getAllByRole("link").map((link) => link.textContent)).toEqual(
      FOOTER_LEGAL_LINKS.map(({ key }) => t(`footer.${key}`)),
    );
    const social = screen.getByRole("list", { name: t("footer.socialLabel") });
    expect(within(social).getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual(
      FOOTER_SOCIAL_LINKS.map(({ name }) => name),
    );
    expect(screen.getByText(`© ${new Date().getFullYear()} Još vrijedi. Sva prava zadržana.`)).toBeInTheDocument();
    // The footer asks the server for nothing.
    expect(apiMock.get.mock.calls.map(([url]) => url).filter((url) => url !== "/users/me" && url !== "/cities" && url !== "/cart")).toEqual([]);
  });

  it("does not navigate from the links whose pages do not exist yet", () => {
    renderFooter();
    for (const name of [t("footer.about"), t("footer.privacy"), "Instagram"]) {
      const link = screen.getByRole("link", { name });
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      fireEvent(link, click);
      expect(click.defaultPrevented).toBe(true);
    }
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });

  it("keeps room above itself for the arch, except where the page ends in a band (flush)", () => {
    const { container, unmount } = renderFooter();
    expect(container.querySelector("footer")).toHaveClass("mt-14");
    expect(screen.getByTestId("footer-arch")).toBeInTheDocument();
    unmount();

    const flush = renderFooter({ flush: true });
    expect(flush.container.querySelector("footer")).not.toHaveClass("mt-14");
  });

  it("is in English in the English interface", async () => {
    await i18n.changeLanguage("en");
    renderFooter();
    expect(screen.getByRole("link", { name: "About us" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How we calculate impact" })).toBeInTheDocument();
    expect(screen.getByText(`© ${new Date().getFullYear()} Još vrijedi. All rights reserved.`)).toBeInTheDocument();
  });
});
