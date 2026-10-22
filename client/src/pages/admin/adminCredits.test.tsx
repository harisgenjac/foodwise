import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AdminCreditRequestsPage from "./AdminCreditRequestsPage.js";
import AdminCreditsPage from "./AdminCreditsPage.js";
import UserCreditsPanel from "../../components/admin/UserCreditsPanel.js";
import { apiMock, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminCreditRequest, AdminCreditUser } from "../../types/index.js";

const admin = makeUser({ role: "ADMIN" });

const REQUEST: AdminCreditRequest = {
  id: 5,
  user_id: 3,
  request_type: "SUBSCRIPTION",
  plan_id: 2,
  topup_package_id: null,
  period_month: "2030-01-01",
  auto_renew: true,
  status: "PENDING",
  source: "USER",
  created_at: "2030-01-02T09:00:00.000Z",
  reviewed_at: null,
  plan_name: "Standard",
  credits: 50,
  price: "30.00",
  admin_note: null,
  user_email: "store@demo.com",
  user_business_name: "Market Centar",
  user_role: "STORE",
  reviewed_by_email: null,
};

describe("AdminCreditRequestsPage", () => {
  it("approves a pending request with an internal note", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: {} });
    renderWithProviders(<AdminCreditRequestsPage />, {
      route: "/admin/credit-requests",
      path: "/admin/credit-requests",
      user: admin,
      get: { "/admin/credits/requests": { requests: [REQUEST], total: 1 } },
    });

    expect(await screen.findByText("Market Centar")).toBeInTheDocument();
    expect(screen.getByText(t("admin.creditRequests.autoRenew"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("admin.creditRequests.approve") }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("admin.creditRequests.note")), "Paid in cash");
    await userEvent.click(within(dialog).getByRole("button", { name: t("admin.creditRequests.approve") }));

    expect(apiMock.post).toHaveBeenCalledWith("/admin/credits/requests/5/approve", { note: "Paid in cash" });
    expect(success).toHaveBeenCalledWith(t("admin.creditRequests.approved"));
  });

  it("offers no decision for a decided request and shows its note", async () => {
    renderWithProviders(<AdminCreditRequestsPage />, {
      route: "/admin/credit-requests",
      path: "/admin/credit-requests",
      user: admin,
      get: {
        "/admin/credits/requests": {
          requests: [{ ...REQUEST, status: "REJECTED", admin_note: "No payment", reviewed_at: "2030-01-03T10:00:00.000Z", reviewed_by_email: "admin@demo.com" }],
          total: 1,
        },
      },
    });

    expect(await screen.findByText("No payment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("admin.creditRequests.approve") })).not.toBeInTheDocument();
  });
});

describe("AdminCreditRequestsPage filters", () => {
  it("starts with the status from the link and sends no other filter", async () => {
    const params: unknown[] = [];
    renderWithProviders(<AdminCreditRequestsPage />, {
      route: "/admin/credit-requests?status=PENDING",
      path: "/admin/credit-requests",
      user: admin,
      get: {
        "/admin/credits/requests": (query: unknown) => {
          params.push(query);
          return { requests: [REQUEST], total: 1 };
        },
      },
    });
    expect(await screen.findByText("Market Centar")).toBeInTheDocument();
    expect(params[0]).toMatchObject({ status: "PENDING", type: "", user_id: "" });
  });
});

describe("AdminCreditsPage", () => {
  it("lists balances and links pending requests", async () => {
    const row: AdminCreditUser = {
      id: 3,
      email: "store@demo.com",
      role: "STORE",
      business_name: "Market Centar",
      is_blocked: false,
      pending_requests: 1,
      plan_name: "Standard",
      has_subscription: true,
      total: 50,
      used: 48,
      available: 2,
    };
    renderWithProviders(<AdminCreditsPage />, {
      route: "/admin/credits",
      path: "/admin/credits",
      user: admin,
      get: { "/admin/credits/overview": { users: [row], total: 1 } },
    });

    expect(await screen.findByText("Market Centar")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("admin.credits.pendingCount", { count: 1 }) })).toHaveAttribute(
      "href",
      "/admin/credit-requests?user_id=3",
    );
  });
});

describe("UserCreditsPanel", () => {
  it("shows the ledger and adjusts the balance with a reason", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderWithProviders(<UserCreditsPanel userId={3} />, {
      route: "/admin/users/3",
      path: "/admin/users/:id",
      user: admin,
      get: {
        "/admin/credits/users/3/ledger": {
          balance: { periodStart: "2030-01-01", periodEnd: "2030-01-31", subscription: null, total: 5, used: 1, available: 0 },
          transactions: [
            {
              id: 1,
              period_month: "2030-01-01",
              amount: -1,
              type: "PRODUCT_CHARGE",
              reason: null,
              category: "Fish",
              related_entity_type: "product",
              related_entity_id: 77,
              refunds_transaction_id: null,
              actor: "USER",
              created_at: "2030-01-02T09:00:00.000Z",
              created_by_email: "store@demo.com",
            },
          ],
          total: 1,
        },
      },
    });

    expect(await screen.findByText(t("admin.userCredits.types.PRODUCT_CHARGE"))).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("admin.userCredits.adjust") }));
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: t("admin.userCredits.save") });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(t("admin.userCredits.amount")), "5");
    await userEvent.type(within(dialog).getByLabelText(t("admin.common.reasonLabel")), "Goodwill");
    await userEvent.click(save);
    expect(apiMock.post).toHaveBeenCalledWith("/admin/credits/users/3/adjust", { amount: 5, reason: "Goodwill" });
  });
});
