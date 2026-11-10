import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import Layout from "../Layout.js";
import { BOTTOM_NAV_ITEMS } from "./bottomNavItems.js";
import { LocationDisplay, makeUser, renderWithProviders, t } from "../../test/utils.js";

const store = makeUser({
  role: "STORE",
  business_name: "Market",
  city: "Sarajevo",
  phone: "061111111",
  address: "Titova 1",
});
const restaurant = { ...store, role: "RESTAURANT" as const, business_name: "Ukus" };
// No business name: the account setup is unfinished, so the navigation is locked.
const lockedStore = { ...store, business_name: "" };

// Layout with every page rendered as the current path, so it stays mounted while navigating.
const renderLayout = (user: ReturnType<typeof makeUser>, route = "/dashboard") =>
  renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<LocationDisplay />} />
      </Route>
    </Routes>,
    {
      route,
      path: "/*",
      user,
      get: {
        "/notifications": { notifications: [], unreadCount: 0 },
        "/credits/me": { credits: null },
        "/announcements/active": { announcements: [] },
        "/stats/impact": { kg: 0 },
        "/admin/credits/requests/pending-count": { count: 0 },
        "/company/credits/branch-requests/count": { count: 0 },
      },
    },
  );

const menuButton = () => screen.findByRole("button", { name: t("header.openMenu") });
const bottomBar = () => screen.queryByRole("navigation", { name: t("bottomNav.label") });

beforeEach(() => {
  // The window scrolls to the top on every page change; jsdom does not implement scrolling.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(async () => {
  localStorage.clear();
  // A closed drawer goes back over its history entry asynchronously; the next test starts after it.
  cleanup();
  await waitFor(() => expect(window.history.state?.overlayDepth).toBeUndefined());
});

describe("MobileDrawer", () => {
  it("starts closed whatever the desktop rail's stored state, and opens with the role's links", async () => {
    localStorage.setItem("sidebarOpen", "true");
    renderLayout(store);
    const button = await menuButton();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(button);
    const drawer = screen.getByRole("dialog", { name: t("sidebar.menu") });
    expect(within(drawer).getByRole("link", { name: t("sidebar.addProduct") })).toHaveAttribute("href", "/add-product");
    expect(within(drawer).getByText(t("sidebar.humanitarian"))).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: t("sidebar.closeMenu") })).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes after following a link and gives focus back to the menu button", async () => {
    renderLayout(store);
    const button = await menuButton();
    await userEvent.click(button);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: t("sidebar.reports") }));

    expect(screen.getByTestId("location")).toHaveTextContent("/reports");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("closes on the backdrop", async () => {
    renderLayout(restaurant);
    await userEvent.click(await menuButton());
    await userEvent.click(screen.getByTestId("mobile-drawer-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderLayout(restaurant);
    const button = await menuButton();
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("closes on Back (the Android back button) and stays on the page", async () => {
    renderLayout(store);
    const button = await menuButton();
    await userEvent.click(button);
    expect(window.history.state).toMatchObject({ overlayDepth: 1 });

    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(document.documentElement.style.overflow).toBe("");
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("keeps Tab inside the drawer", async () => {
    renderLayout(store);
    await userEvent.click(await menuButton());
    const drawer = screen.getByRole("dialog");
    // The close button has focus; before it comes the logo, then Shift+Tab wraps to the last link.
    await userEvent.tab({ shift: true });
    expect(within(drawer).getAllByRole("link")[0]).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(drawer).getByRole("link", { name: t("sidebar.sponsor") })).toHaveFocus();
    await userEvent.tab();
    expect(within(drawer).getAllByRole("link")[0]).toHaveFocus();
  });

  it("cannot be opened while the account setup is unfinished", async () => {
    renderLayout(lockedStore);
    const button = await menuButton();
    expect(button).toBeDisabled();
    await userEvent.click(button);
    // Only the account setup dialog is shown.
    expect(screen.queryByRole("dialog", { name: t("sidebar.menu") })).not.toBeInTheDocument();
  });

  it("gives admins their links in the drawer", async () => {
    renderLayout(makeUser({ role: "ADMIN" }), "/admin");
    await userEvent.click(await menuButton());
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: t("sidebar.adminCompanies") })).toBeInTheDocument();
  });
});

describe("BottomNav", () => {
  const itemLinks = () =>
    within(bottomBar()!)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

  it("shows the store's pages from the config, then More", async () => {
    renderLayout(store);
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    expect(itemLinks()).toEqual(BOTTOM_NAV_ITEMS.STORE.map((item) => item.to));
    expect(itemLinks()).toEqual(["/dashboard", "/my-products", "/orders", "/pickups"]);
    const bar = within(bottomBar()!);
    expect(bar.getByRole("link", { name: t("bottomNav.myProducts") })).toBeInTheDocument();
    expect(bar.getAllByRole("listitem").at(-1)).toHaveTextContent(t("bottomNav.more"));
  });

  it("shows the restaurant's pages from the config", async () => {
    renderLayout(restaurant);
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    expect(itemLinks()).toEqual(["/dashboard", "/browse-products", "/my-orders", "/pickups"]);
    expect(within(bottomBar()!).getByRole("link", { name: t("bottomNav.browseProducts") })).toBeInTheDocument();
  });

  it("marks only the current page as active", async () => {
    renderLayout(store, "/my-products");
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    const bar = within(bottomBar()!);
    expect(bar.getByRole("link", { name: t("bottomNav.myProducts") })).toHaveAttribute("aria-current", "page");
    // /dashboard is matched exactly, so it is not active on other pages.
    expect(bar.getByRole("link", { name: t("bottomNav.dashboard") })).not.toHaveAttribute("aria-current");
  });

  it("is not shown to admins or company headquarters", async () => {
    const { unmount } = renderLayout(makeUser({ role: "ADMIN" }), "/admin");
    await menuButton();
    expect(bottomBar()).not.toBeInTheDocument();
    unmount();

    renderLayout(makeUser({ role: "COMPANY", company_id: 3, phone: "035 000 111" }));
    await menuButton();
    expect(bottomBar()).not.toBeInTheDocument();
  });

  it("is locked while the account setup is unfinished", async () => {
    renderLayout(lockedStore, "/my-profile");
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    expect(bottomBar()).toHaveAttribute("aria-disabled", "true");
    expect(bottomBar()).toHaveAttribute("inert");
  });

  it("opens the drawer from More and gives focus back to More when it closes", async () => {
    renderLayout(restaurant);
    await waitFor(() => expect(bottomBar()).toBeInTheDocument());
    const more = within(bottomBar()!).getByRole("button", { name: t("bottomNav.more") });
    await userEvent.click(more);
    expect(screen.getByRole("dialog", { name: t("sidebar.menu") })).toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });
});
