import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Breadcrumbs, { BreadcrumbPlaceholder } from "./Breadcrumbs.js";
import type { BreadcrumbItem } from "./Breadcrumbs.js";
import { t } from "../test/utils.js";

const renderTrail = (items: BreadcrumbItem[]) =>
  render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  );

const nav = () => screen.getByRole("navigation", { name: t("breadcrumbs.label") });
// The full trail (sm and up); the "‹ parent" link for phones sits outside the list.
const trail = () => within(nav()).getByRole("list");

const ITEMS: BreadcrumbItem[] = [
  { label: "Moji proizvodi", to: "/my-products" },
  { label: "Piletina", to: "/products/10" },
  { label: "Uredi" },
];

describe("Breadcrumbs", () => {
  it("links every item but the last, which is the current page", () => {
    renderTrail(ITEMS);
    const items = within(trail()).getAllByRole("listitem");

    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("link", { name: "Moji proizvodi" })).toHaveAttribute("href", "/my-products");
    expect(within(items[1]).getByRole("link", { name: "Piletina" })).toHaveAttribute("href", "/products/10");
    expect(within(items[2]).queryByRole("link")).not.toBeInTheDocument();
    expect(within(items[2]).getByText("Uredi")).toHaveAttribute("aria-current", "page");
  });

  it("hides the separators from screen readers", () => {
    renderTrail(ITEMS);
    const separators = trail().querySelectorAll("svg");

    expect(separators).toHaveLength(2);
    separators.forEach((separator) => expect(separator).toHaveAttribute("aria-hidden", "true"));
  });

  it("shows the full name in the title of a long label", () => {
    const name = "Domaća piletina iz slobodnog uzgoja, pakovanje od pet kilograma";
    renderTrail([{ label: "Moji proizvodi", to: "/my-products" }, { label: name }]);

    expect(within(trail()).getByText(name)).toHaveAttribute("title", name);
  });

  it("offers only the parent as a back link on phones", () => {
    renderTrail(ITEMS);
    const mobile = within(nav())
      .getAllByRole("link", { name: "Piletina" })
      .find((link) => !trail().contains(link));

    expect(mobile).toHaveAttribute("href", "/products/10");
    expect(mobile).toHaveClass("sm:hidden");
    expect(trail()).toHaveClass("hidden", "sm:flex");
  });

  it("keeps a lone parent clickable when the record was not found", () => {
    renderTrail([{ label: "Moji proizvodi", to: "/my-products" }]);

    expect(within(trail()).getByRole("link", { name: "Moji proizvodi" })).toHaveAttribute("href", "/my-products");
    expect(nav().querySelector("[aria-current]")).toBeNull();
  });

  it("stands in for a name that is still loading", () => {
    renderTrail([{ label: "Moji proizvodi", to: "/my-products" }, { label: <BreadcrumbPlaceholder /> }]);

    expect(within(trail()).getByText(t("common.loading")).closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
