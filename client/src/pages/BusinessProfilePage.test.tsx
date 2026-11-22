import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import MyProfilePage from "./MyProfilePage.js";
import AppToaster from "../components/AppToaster.js";
import { CreditsProvider } from "../context/CreditsContext.js";
import { apiMock, axiosError, makeCreditSummary, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { LocationMapProps } from "../components/profile/LocationMap.js";
import type { CreditRequest, CreditSummary, User } from "../types/index.js";

// Leaflet does not run in jsdom: a stand-in that shows the pin and moves it like a click or a drag.
vi.mock("../components/profile/LocationMap.js", () => ({
  default: ({ value, onChange, label }: LocationMapProps) => (
    <div aria-label={label}>
      <span data-testid="pin">{value ? `${value.latitude},${value.longitude}` : "none"}</span>
      <button type="button" onClick={() => onChange({ latitude: 43.86, longitude: 18.42 })}>
        map click
      </button>
    </div>
  ),
}));

const WEEK = { open: "08:00", close: "20:00" };
const SCHEDULE = { mon: WEEK, tue: WEEK, wed: WEEK, thu: WEEK, fri: WEEK, sat: WEEK, sun: WEEK };

const RESTAURANT = makeUser({
  role: "RESTAURANT",
  business_name: "Restoran Ukus",
  city: "Sarajevo",
  city_id: 1,
  phone: "062 111 111",
  address: "Titova 20",
  email: "ukus@test.com",
  opening_schedule: SCHEDULE,
});
const STORE = makeUser({
  ...RESTAURANT,
  role: "STORE",
  business_name: "Market Centar",
  pickup_schedule: SCHEDULE,
  delivery_enabled: true,
  preparation_minutes: 30,
  orders_paused: false,
  orders_paused_until: null,
});
const BRANCH = makeUser({ ...STORE, business_name: "Bingo Tuzla", company_id: 3, company_name: "Bingo d.o.o." });

const PLANS = [
  { id: 1, name: "Mali", credits_per_period: 20, price: "20.00" },
  { id: 2, name: "Standard", credits_per_period: 50, price: "40.00" },
];
const PACKAGES = [{ id: 7, credits: 10, price: "10.00" }];

const renderProfile = (
  user: User,
  { credits = makeCreditSummary(), requests = [] as CreditRequest[], route = "/my-profile" }: { credits?: CreditSummary; requests?: CreditRequest[]; route?: string } = {},
) => {
  // jsdom has no matchMedia; react-hot-toast asks it about reduced motion.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  return renderWithProviders(
    <CreditsProvider enabled={user.role === "STORE"}>
      <AppToaster />
      <MyProfilePage />
    </CreditsProvider>,
    {
      route,
      path: "/my-profile",
      user,
      get: {
        "/credits/me": { credits },
        "/credits/plans": { plans: PLANS },
        "/credits/topup-packages": { packages: PACKAGES },
        "/credits/requests": { requests, total: requests.length },
      },
    },
  );
};

const section = (id: string) => screen.getByTestId(`profile-section-${id}`);
const header = (id: string) => within(section(id)).getAllByRole("button")[0]!;
const open = async (id: string) => {
  if (header(id).getAttribute("aria-expanded") !== "true") await userEvent.click(header(id));
};
const saveButton = () => screen.getAllByRole("button", { name: t("profile.header.save") }).at(-1)!;
const loaded = () => screen.findByDisplayValue("062 111 111");

beforeEach(() => {
  apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully." } });
  apiMock.patch.mockResolvedValue({ data: {} });
  apiMock.post.mockResolvedValue({ data: {} });
  apiMock.delete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  act(() => toast.remove());
  vi.unstubAllGlobals();
});

describe("BusinessProfilePage", () => {
  it("opens with only Osnovne informacije open, and the restaurant's four sections", async () => {
    renderProfile(RESTAURANT);
    await loaded();
    expect(screen.getByRole("heading", { level: 1, name: "Moj profil" })).toBeInTheDocument();
    expect(screen.getByText(/Restoran Ukus · podaci, lokacija, radno vrijeme i lozinka/)).toBeInTheDocument();
    const ids = screen.getAllByTestId(/^profile-section-/).map((node) => node.dataset.testid);
    expect(ids).toEqual(["profile-section-basic", "profile-section-location", "profile-section-hours", "profile-section-password"]);
    expect(header("basic")).toHaveAttribute("aria-expanded", "true");
    for (const id of ["location", "hours", "password"]) expect(header(id)).toHaveAttribute("aria-expanded", "false");
    expect(header("hours")).toHaveAttribute("aria-controls", "hours-body");
    expect(screen.queryByTestId("branch-chip")).not.toBeInTheDocument();
    // The logo can be replaced but not removed.
    expect(screen.getByLabelText(t("profile.basic.changeLogo"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ukloni logo/ })).not.toBeInTheDocument();
    // Every section and the save button sit in one white card.
    expect(screen.getByTestId("profile-card")).toContainElement(section("password"));
    expect(screen.getByTestId("profile-card")).toContainElement(saveButton());
  });

  it("gives a store the six sections", async () => {
    renderProfile(STORE);
    await loaded();
    const ids = screen.getAllByTestId(/^profile-section-/).map((node) => node.dataset.testid!.replace("profile-section-", ""));
    expect(ids).toEqual(["basic", "location", "hours", "orders", "subscription", "password"]);
  });

  it("saves the changed profile with one button, sends nothing else, and confirms with a toast", async () => {
    renderProfile(RESTAURANT);
    const phone = await loaded();
    await userEvent.clear(phone);
    await userEvent.type(phone, "061 222 333");
    await userEvent.click(saveButton());

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith("/users/me", expect.objectContaining({ phone: "061 222 333", business_name: "Restoran Ukus", city_id: 1 })));
    expect(apiMock.patch).not.toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(await screen.findByText("Izmjene su sačuvane.")).toBeInTheDocument();
  });

  it("opens a closed section with an error on save and focuses the field", async () => {
    renderProfile(RESTAURANT);
    const phone = await loaded();
    await userEvent.clear(phone);
    await userEvent.click(header("basic"));
    expect(header("basic")).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(saveButton());
    expect(header("basic")).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByTestId("business-profile").querySelector("[data-invalid]")).toHaveFocus());
    expect(within(section("basic")).getByText(t("common.fieldRequired"))).toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  describe("password", () => {
    const fill = async (values: Partial<Record<"current" | "next" | "repeat", string>>) => {
      await open("password");
      const fields = {
        current: screen.getByLabelText(t("user.currentPassword")),
        next: screen.getByLabelText(t("user.newPassword")),
        repeat: screen.getByLabelText(t("user.repeatPassword")),
      };
      for (const [name, value] of Object.entries(values)) await userEvent.type(fields[name as keyof typeof fields], value);
      return fields;
    };

    it("is not changed while all three are empty", async () => {
      renderProfile(RESTAURANT);
      await loaded();
      await userEvent.click(saveButton());
      await waitFor(() => expect(screen.getByText("Izmjene su sačuvane.")).toBeInTheDocument());
      expect(apiMock.put).not.toHaveBeenCalledWith("/users/me/password", expect.anything());
    });

    it("needs all three once one is filled, at least 8 characters and the same new one twice", async () => {
      renderProfile(RESTAURANT);
      await loaded();
      await fill({ next: "kratka" });
      await userEvent.click(saveButton());
      const password = within(section("password"));
      expect(password.getAllByText(t("common.fieldRequired"))).toHaveLength(2);
      expect(password.getByText(t("profile.password.tooShort"))).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(t("user.newPassword")), "duga");
      await userEvent.type(screen.getByLabelText(t("user.currentPassword")), "stara-lozinka");
      await userEvent.type(screen.getByLabelText(t("user.repeatPassword")), "nesto-drugo");
      await userEvent.click(saveButton());
      expect(password.getByText(t("user.passwordMismatch"))).toBeInTheDocument();
      expect(apiMock.put).not.toHaveBeenCalled();
    });

    it("changes it on save, clears the fields, and shows a wrong current password on its field", async () => {
      apiMock.put.mockRejectedValueOnce(axiosError(400, "Trenutna lozinka nije tačna."));
      renderProfile(RESTAURANT);
      await loaded();
      const fields = await fill({ current: "stara-lozinka", next: "nova-lozinka", repeat: "nova-lozinka" });
      await userEvent.click(saveButton());
      expect(await within(section("password")).findByText("Trenutna lozinka nije tačna.")).toBeInTheDocument();
      expect(fields.current).toHaveAttribute("aria-invalid", "true");

      await userEvent.click(saveButton());
      await waitFor(() =>
        expect(apiMock.put).toHaveBeenLastCalledWith("/users/me/password", { current_password: "stara-lozinka", new_password: "nova-lozinka" }),
      );
      await waitFor(() => expect(screen.getByLabelText(t("user.newPassword"))).toHaveValue(""));
    });

    it("shows and hides a password with the eye button", async () => {
      renderProfile(RESTAURANT);
      await loaded();
      const { current } = await fill({ current: "tajna" });
      expect(current).toHaveAttribute("type", "password");
      await userEvent.click(screen.getByRole("button", { name: t("profile.password.show", { field: t("user.currentPassword") }) }));
      expect(current).toHaveAttribute("type", "text");
    });
  });

  describe("location", () => {
    it("sets the first pin without asking", async () => {
      renderProfile(RESTAURANT);
      await loaded();
      await open("location");
      await userEvent.click(await screen.findByRole("button", { name: "map click" }));
      expect(screen.getByTestId("pin")).toHaveTextContent("43.86,18.42");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("asks before moving or removing a pin, and Cancel keeps it", async () => {
      renderProfile({ ...RESTAURANT, latitude: 43.85, longitude: 18.41 });
      await loaded();
      await open("location");
      await userEvent.click(await screen.findByRole("button", { name: "map click" }));
      const change = screen.getByRole("dialog", { name: "Promijeniti lokaciju?" });
      await userEvent.click(within(change).getByRole("button", { name: t("common.cancel") }));
      expect(screen.getByTestId("pin")).toHaveTextContent("43.85,18.41");

      await userEvent.click(screen.getByRole("button", { name: "map click" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Promijeni lokaciju" }));
      expect(screen.getByTestId("pin")).toHaveTextContent("43.86,18.42");

      await userEvent.click(screen.getByRole("button", { name: t("location.remove") }));
      const remove = screen.getByRole("dialog", { name: "Ukloniti lokaciju?" });
      expect(remove).toHaveTextContent("Bez lokacije dostava nije moguća.");
      await userEvent.click(within(remove).getByRole("button", { name: "Ukloni lokaciju" }));
      expect(screen.getByTestId("pin")).toHaveTextContent("none");
    });
  });

  describe("hours", () => {
    it("shows Zatvoreno for a day switched off", async () => {
      renderProfile(RESTAURANT);
      await loaded();
      await open("hours");
      const sunday = screen.getByTestId("hours-row-sun");
      await userEvent.click(within(sunday).getByRole("switch"));
      expect(within(sunday).getByText("Zatvoreno")).toBeInTheDocument();
      expect(within(sunday).queryByLabelText(/Otvara/)).not.toBeInTheDocument();
    });

    it("copies Monday to every day in both of a store's tables", async () => {
      renderProfile(STORE);
      await loaded();
      await open("hours");
      for (const table of ["hours-opening", "hours-pickup"]) {
        const box = within(screen.getByTestId(table));
        const [opens] = box.getAllByLabelText(t("schedule.opensAt", { day: t("schedule.days.mon") }));
        fireEvent.change(opens!, { target: { value: "07:00" } });
        await userEvent.click(box.getByRole("button", { name: t("schedule.copyMonday") }));
        expect(box.getByLabelText(t("schedule.opensAt", { day: t("schedule.days.sun") }))).toHaveValue("07:00");
      }
    });
  });

  describe("orders", () => {
    it("pauses only on save: the chip and the button change at once, the request goes with the save", async () => {
      renderProfile(STORE);
      await loaded();
      await open("orders");
      await userEvent.click(screen.getByRole("button", { name: t("orderPause.pause") }));
      const dialog = screen.getByRole("dialog");
      await userEvent.click(within(dialog).getByLabelText(t("orderPause.options.untilResumed")));
      await userEvent.click(within(dialog).getByRole("button", { name: t("orderPause.confirm") }));

      const pause = screen.getByTestId("order-pause");
      expect(pause).toHaveTextContent(/Pauzirano/);
      expect(within(pause).getByRole("button", { name: "Nastavi primanje" })).toBeInTheDocument();
      expect(apiMock.patch).not.toHaveBeenCalled();

      await userEvent.click(saveButton());
      await waitFor(() =>
        expect(apiMock.patch).toHaveBeenCalledWith("/users/me/order-settings", { orders_paused: true, orders_paused_until: null }),
      );
    });

    it("shows Pauzirano do <time> for a timed pause", async () => {
      const until = new Date(Date.now() + 60 * 60 * 1000);
      renderProfile({ ...STORE, orders_paused: true, orders_paused_until: until.toISOString() });
      await loaded();
      await open("orders");
      const time = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`;
      expect(within(screen.getByTestId("order-pause")).getByText(`Pauzirano do ${time}`)).toBeInTheDocument();
    });
  });

  describe("credits", () => {
    it("sends a plan change only on save, after the explanation dialog", async () => {
      renderProfile(STORE);
      await loaded();
      await open("subscription");
      await userEvent.click(await screen.findByRole("button", { name: "Promijeni plan" }));
      await userEvent.click(within(screen.getByTestId("plan-options")).getByRole("button", { name: /Mali/ }));
      expect(screen.getByTestId("chosen-plan")).toBeInTheDocument();
      expect(apiMock.post).not.toHaveBeenCalled();

      await userEvent.click(saveButton());
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(t("credits.modal.whatTitle"));
      expect(apiMock.post).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: t("credits.modal.submit") }));
      await waitFor(() =>
        expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", {
          request_type: "SUBSCRIPTION",
          plan_id: 1,
          period: "next",
          auto_renew: false,
        }),
      );
    });

    it("sends a top-up and a withdrawal only on save", async () => {
      const pending = {
        id: 41,
        request_type: "SUBSCRIPTION",
        plan_name: "Standard",
        credits: 50,
        period_month: "2030-02-01",
        status: "PENDING",
        source: "USER",
      } as CreditRequest;
      renderProfile(STORE, { requests: [pending] });
      await loaded();
      await open("subscription");
      await userEvent.click(await screen.findByRole("button", { name: t("credits.profile.buyTopup") }));
      await userEvent.click(within(screen.getByTestId("topup-options")).getByRole("button", { name: /10 kredita/ }));
      await userEvent.click(within(screen.getByTestId("credit-request")).getByRole("button", { name: "Povuci zahtjev" }));
      expect(screen.getByTestId("credit-request")).toHaveTextContent("Povlači se pri spremanju");
      expect(apiMock.post).not.toHaveBeenCalled();
      expect(apiMock.delete).not.toHaveBeenCalled();

      await userEvent.click(saveButton());
      await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", { request_type: "TOPUP", topup_package_id: 7 }));
      expect(apiMock.delete).toHaveBeenCalledWith("/credits/requests/41");
    });

    it("shows a branch its chip and its balance without plan or auto-renew controls", async () => {
      renderProfile(BRANCH, {
        credits: makeCreditSummary({ managedByCompany: true, companyName: "Bingo d.o.o." }),
      });
      await loaded();
      expect(screen.getByTestId("branch-chip")).toHaveTextContent("Poslovnica · Bingo d.o.o.");
      await open("subscription");
      expect(await screen.findByText("Pretplatu i kredite vodi centrala (Bingo d.o.o.).")).toBeInTheDocument();
      expect(screen.getByTestId("credits-usage-bar")).toBeInTheDocument();
      expect(screen.queryByRole("switch", { name: t("credits.profile.autoRenew") })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Promijeni plan" })).not.toBeInTheDocument();
      // It still asks its headquarters for extra credits.
      expect(screen.getByRole("button", { name: t("credits.profile.requestTopupFromCompany") })).toBeInTheDocument();
      // Its name and city are its company's.
      expect(screen.getByDisplayValue("Bingo Tuzla")).toBeDisabled();
    });
  });

  it("keeps the old page for a company headquarters and an admin", async () => {
    renderProfile(makeUser({ role: "COMPANY", company_id: 3, company_name: "Bingo d.o.o.", phone: "033 000" }));
    expect(await screen.findByText(t("user.personalSection"))).toBeInTheDocument();
    expect(screen.queryByTestId("business-profile")).not.toBeInTheDocument();
  });
});
