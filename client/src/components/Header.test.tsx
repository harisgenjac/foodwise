import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import Header from "./Header.js";
import { NotificationsProvider } from "../context/NotificationsContext.js";
import { CartProvider } from "../context/CartContext.js";
import {
  LocationDisplay,
  apiMock,
  axiosError,
  makeCart,
  makeCartLine,
  makeNotification,
  makeUser,
  renderWithProviders,
  t,
} from "../test/utils.js";

const user = makeUser({ role: "STORE" });

const renderHeader = () =>
  renderWithProviders(
    <NotificationsProvider enabled={false}>
      <Header isSidebarOpen onToggleSidebar={() => {}} />
    </NotificationsProvider>,
    { route: "/dashboard", path: "/dashboard", user },
  );

const logOut = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /Amir Hodžić/ }));
  await userEvent.click(screen.getByRole("button", { name: t("header.logout") }));
};

describe("Header logout", () => {
  it("goes to the login page without a toast", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Logged out." } });
    const success = vi.spyOn(toast, "success");
    renderHeader();

    await logOut();
    expect(apiMock.post).toHaveBeenCalledWith("/auth/logout");
    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
    expect(success).not.toHaveBeenCalled();
  });

  it("says so and stays when logging out fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(500));
    const errorToast = vi.spyOn(toast, "error");
    renderHeader();

    await logOut();
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(t("header.logoutError")));
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });
});

describe("Header on phones", () => {
  // Header plus a link outside it, mounted on every path so a page change keeps it rendered.
  const renderWithLink = () =>
    renderWithProviders(
      <NotificationsProvider enabled>
        <Header isSidebarOpen onToggleSidebar={() => {}} />
        <Link to="/other">{"elsewhere"}</Link>
        <LocationDisplay />
      </NotificationsProvider>,
      {
        route: "/dashboard",
        path: "*",
        user,
        get: { "/notifications": { notifications: [makeNotification()], unreadCount: 1 } },
      },
    );

  const bell = () => screen.getByRole("button", { name: t("header.notificationsLabel") });

  it("gives the bell and the profile button 44 px touch targets below md", async () => {
    renderHeader();
    expect(bell()).toHaveClass("h-11", "w-11", "md:h-auto", "md:w-auto");
    expect(await screen.findByRole("button", { name: /Amir Hodžić/ })).toHaveClass("p-1", "md:pr-2");
  });

  it("opens the notifications as a full-width panel under the header below sm, with a scrolling list", async () => {
    renderWithLink();
    await userEvent.click(bell());
    const panel = await screen.findByTestId("notifications-panel");
    expect(panel).toHaveClass("fixed", "inset-x-0", "top-16", "max-h-[calc(100dvh-4rem)]");
    // From sm up it is the dropdown under the bell, as before.
    expect(panel).toHaveClass("sm:absolute", "sm:right-0", "sm:top-full", "sm:w-96");
    expect(await within(panel).findByTestId("notifications-list")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(bell()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the panel on Escape and gives focus back to the bell", async () => {
    renderWithLink();
    await userEvent.click(bell());
    await screen.findByTestId("notifications-panel");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument();
    expect(bell()).toHaveFocus();
  });

  it("closes the panel when the page changes", async () => {
    renderWithLink();
    await userEvent.click(bell());
    await screen.findByTestId("notifications-panel");
    // A keyboard press, not a click: a click outside closes it on its own.
    screen.getByRole("link", { name: "elsewhere" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/other");
    await waitFor(() => expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument());
  });
});

describe("Header for a branch", () => {
  it("shows the branch and its company instead of the role", async () => {
    renderWithProviders(
      <NotificationsProvider enabled={false}>
        <Header isSidebarOpen onToggleSidebar={() => {}} />
      </NotificationsProvider>,
      {
        route: "/dashboard",
        path: "/dashboard",
        user: makeUser({ role: "STORE", business_name: "Bingo Visoko", company_id: 3, company_name: "Bingo d.o.o." }),
      },
    );
    expect(
      await screen.findByText(t("header.branchOf", { branch: "Bingo Visoko", company: "Bingo d.o.o." })),
    ).toBeInTheDocument();
    expect(screen.queryByText(t("auth.storeRole"))).not.toBeInTheDocument();
  });
});

describe("Header cart", () => {
  const renderFor = (role: "RESTAURANT" | "STORE", cart = makeCart([makeCartLine({ product_id: 1 }), makeCartLine({ product_id: 2 })])) =>
    renderWithProviders(
      <CartProvider enabled={role === "RESTAURANT"}>
        <NotificationsProvider enabled={false}>
          <Header isSidebarOpen onToggleSidebar={() => {}} />
        </NotificationsProvider>
      </CartProvider>,
      { route: "/dashboard", path: "/dashboard", user: makeUser({ role }), get: { "/cart": { cart } } },
    );

  it("shows restaurants a link to the cart with the number of lines", async () => {
    renderFor("RESTAURANT");
    const link = await screen.findByRole("link", { name: t("header.cartLabelCount", { count: 2 }) });
    expect(link).toHaveAttribute("href", "/cart");
    expect(link).toHaveTextContent("2");
  });

  it("shows no badge for an empty cart", async () => {
    renderFor("RESTAURANT", makeCart([]));
    expect(await screen.findByRole("link", { name: t("header.cartLabel") })).toBeInTheDocument();
  });

  it("has no cart for stores", async () => {
    renderFor("STORE");
    await screen.findByRole("button", { name: /Amir Hodžić/ });
    expect(screen.queryByRole("link", { name: t("header.cartLabel") })).not.toBeInTheDocument();
  });
});
