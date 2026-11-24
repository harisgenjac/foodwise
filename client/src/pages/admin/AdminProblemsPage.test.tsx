import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AdminProblemsPage from "./AdminProblemsPage.js";
import AdminOrderDetailsPage from "./AdminOrderDetailsPage.js";
import { apiMock, makeOrderDetails, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminOrderProblem } from "../../types/index.js";

const admin = makeUser({ role: "ADMIN" });

const PROBLEM: AdminOrderProblem = {
  id: 4,
  order_id: 20,
  order_code: "K7PM",
  fulfilment_method: "DELIVERY",
  reason: "MISSING_ITEM",
  text: "Nedostaje jogurt.",
  status: "OPEN",
  admin_reply: null,
  replied_at: null,
  resolved_at: null,
  created_at: "2030-01-02T09:00:00.000Z",
  updated_at: "2030-01-02T09:00:00.000Z",
  restaurant_id: 1,
  restaurant_name: "Restoran Ukus",
  restaurant_email: "restaurant@demo.com",
  store_id: 2,
  store_name: "Market Centar",
  store_email: "store@demo.com",
  resolved_by_email: null,
};

const renderList = (problems: AdminOrderProblem[] = [PROBLEM], onGet = vi.fn()) =>
  renderWithProviders(<AdminProblemsPage />, {
    route: "/admin/problems",
    path: "/admin/problems",
    user: admin,
    get: {
      "/admin/problems": (params: unknown) => {
        onGet(params);
        return { problems, total: problems.length };
      },
    },
  });

describe("AdminProblemsPage", () => {
  it("lists the reports with the order linked to the admin's order page, both businesses, reason, text and status", async () => {
    renderList();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "#K7PM" })).toHaveAttribute("href", "/admin/orders/20");
    expect(within(table).getByRole("link", { name: "Restoran Ukus" })).toHaveAttribute("href", "/admin/users/1");
    expect(within(table).getByText("Market Centar")).toBeInTheDocument();
    expect(within(table).getByText(t("orders.problems.reasons.MISSING_ITEM"))).toBeInTheDocument();
    expect(within(table).getByText("Nedostaje jogurt.")).toBeInTheDocument();
    expect(within(table).getByText(t("orders.problems.statuses.OPEN"))).toBeInTheDocument();
    expect(screen.getByText(t("admin.problems.count", { count: 1 }))).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const onGet = vi.fn();
    renderList([PROBLEM], onGet);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText(t("admin.problems.columnStatus")), "RESOLVED");
    await waitFor(() => expect(onGet).toHaveBeenLastCalledWith(expect.objectContaining({ status: "RESOLVED", offset: 0 })));
  });

  it("sets the status and replies in the modal, then reloads the list", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.patch.mockResolvedValue({ data: { message: "Problem report updated." } });
    const onGet = vi.fn();
    renderList([PROBLEM], onGet);
    const table = await screen.findByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: t("admin.problems.handle") }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t("admin.problems.modalTitle", { code: "#K7PM" }))).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText(t("admin.problems.status")), "RESOLVED");
    await userEvent.type(within(dialog).getByLabelText(t("admin.problems.reply")), "  Prodavnica vraća novac. ");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.problems.save") }));

    expect(apiMock.patch).toHaveBeenCalledWith("/admin/problems/4", { status: "RESOLVED", reply: "Prodavnica vraća novac." });
    expect(success).toHaveBeenCalledWith(t("admin.problems.saved"));
    await waitFor(() => expect(onGet).toHaveBeenCalledTimes(2));
  });

  it("sends only the status when the reply did not change", async () => {
    apiMock.patch.mockResolvedValue({ data: {} });
    renderList([{ ...PROBLEM, status: "IN_PROGRESS", admin_reply: "Provjeravamo." }]);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Provjeravamo.")).toBeInTheDocument();
    await userEvent.click(within(table).getByRole("button", { name: t("admin.problems.handle") }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(t("admin.problems.reply"))).toHaveValue("Provjeravamo.");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.problems.save") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/admin/problems/4", { status: "IN_PROGRESS" });
  });

  it("says when there are no reports", async () => {
    renderList([]);
    expect(await screen.findByText(t("admin.problems.emptyTitle"))).toBeInTheDocument();
  });
});

describe("AdminOrderDetailsPage feedback", () => {
  it("shows the courier rating with its comment and the order's problem reports", async () => {
    const order = makeOrderDetails({
      fulfilment_method: "DELIVERY",
      status: "Completed",
      courier_rating: {
        rating: 4,
        comment: "Ljubazan kurir.",
        courier_name: "Amar Hodžić",
        created_at: "2030-01-02T10:00:00.000Z",
        sent_at: "2030-01-02T10:00:01.000Z",
      },
      problems: [
        {
          id: 4,
          fulfilment_method: "DELIVERY",
          reason: "LATE",
          text: null,
          status: "RESOLVED",
          admin_reply: "Izvinjavamo se.",
          replied_at: "2030-01-02T11:00:00.000Z",
          resolved_at: "2030-01-02T11:00:00.000Z",
          created_at: "2030-01-02T10:30:00.000Z",
        },
      ],
    });
    renderWithProviders(<AdminOrderDetailsPage />, {
      route: "/admin/orders/20",
      path: "/admin/orders/:id",
      user: admin,
      get: { "/admin/orders/20": { order } },
    });
    const feedback = await screen.findByTestId("admin-order-feedback");
    expect(within(feedback).getByText(t("admin.orderFeedback.ratingValue", { rating: 4 }))).toBeInTheDocument();
    expect(within(feedback).getByText("Ljubazan kurir.")).toBeInTheDocument();
    expect(within(feedback).getByText(t("orders.problems.reasons.LATE"))).toBeInTheDocument();
    expect(within(feedback).getByText(t("orders.problems.statuses.RESOLVED"))).toBeInTheDocument();
    expect(within(feedback).getByRole("link", { name: t("admin.orderFeedback.openProblems") })).toHaveAttribute(
      "href",
      "/admin/problems",
    );
  });

  it("shows nothing extra without a rating or reports", async () => {
    renderWithProviders(<AdminOrderDetailsPage />, {
      route: "/admin/orders/20",
      path: "/admin/orders/:id",
      user: admin,
      get: { "/admin/orders/20": { order: makeOrderDetails({ problems: [], courier_rating: null }) } },
    });
    expect(await screen.findByText("Market Centar")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-order-feedback")).not.toBeInTheDocument();
  });
});
