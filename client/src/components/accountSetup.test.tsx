import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { Mail } from "lucide-react";
import AccountSetupGate from "./AccountSetupGate.js";
import ChangePasswordForm from "./profile/ChangePasswordForm.js";
import FormField from "./form/FormField.js";
import { getAccountSetup } from "../utils/accountSetup.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";

const complete = makeUser({
  role: "STORE",
  business_name: "Market",
  city: "Sarajevo",
  phone: "061111111",
  address: "Titova 1",
});

describe("getAccountSetup", () => {
  it("lists the missing required fields of a store or restaurant", () => {
    const setup = getAccountSetup(makeUser({ role: "RESTAURANT", first_name: null, business_name: "Ukus", city: " " }));
    expect(setup.missingFields).toEqual(["first_name", "city", "phone", "address"]);
    expect(setup.locked).toBe(true);
  });

  it("only asks an admin for a new password", () => {
    expect(getAccountSetup(makeUser({ role: "ADMIN", first_name: null })).locked).toBe(false);
    expect(getAccountSetup(makeUser({ role: "ADMIN", must_change_password: true }))).toEqual({
      needsPassword: true,
      missingFields: [],
      locked: true,
    });
  });

  it("unlocks a complete profile without a temporary password", () => {
    expect(getAccountSetup(complete).locked).toBe(false);
    expect(getAccountSetup(null).locked).toBe(false);
  });
});

describe("AccountSetupGate", () => {
  it("blocks other pages with a dialog that lists the steps and links to My profile", async () => {
    renderWithProviders(<AccountSetupGate />, {
      route: "/dashboard",
      path: "/dashboard",
      user: { ...complete, address: undefined, must_change_password: true },
    });

    const dialog = await screen.findByRole("dialog", { name: t("accountSetup.title") });
    expect(dialog).toHaveTextContent(t("accountSetup.needsPassword"));
    expect(dialog).toHaveTextContent(t("accountSetup.missingFields", { fields: t("user.address") }));
    expect(screen.getByRole("link", { name: new RegExp(t("accountSetup.goToProfile")) })).toHaveAttribute(
      "href",
      "/my-profile",
    );
  });

  it("shows a strip instead of the dialog on My profile", async () => {
    renderWithProviders(<AccountSetupGate />, {
      route: "/my-profile",
      path: "/my-profile",
      user: { ...complete, phone: undefined },
    });
    expect(await screen.findByText(t("accountSetup.profileHint"))).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows nothing once the account is set up", async () => {
    renderWithProviders(<AccountSetupGate />, { route: "/dashboard", path: "/dashboard", user: complete });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/users/me"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ChangePasswordForm", () => {
  const fill = async (current: string, next: string, repeat: string) => {
    await userEvent.type(screen.getByLabelText(t("user.currentPassword")), current);
    await userEvent.type(screen.getByLabelText(t("user.newPassword")), next);
    await userEvent.type(screen.getByLabelText(t("user.repeatPassword")), repeat);
    await userEvent.click(screen.getByRole("button", { name: t("user.changePassword") }));
  };

  it("sends the current and the new password, then refreshes the user", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Password changed." } });
    const success = vi.spyOn(toast, "success");
    renderWithProviders(<ChangePasswordForm />, { user: complete });

    await fill("stara-lozinka", "nova-lozinka", "nova-lozinka");
    expect(apiMock.put).toHaveBeenCalledWith("/users/me/password", {
      current_password: "stara-lozinka",
      new_password: "nova-lozinka",
    });
    await waitFor(() => expect(success).toHaveBeenCalledWith(t("user.passwordChanged")));
    expect(screen.getByLabelText(t("user.newPassword"))).toHaveValue("");
  });

  it("stops when the new passwords differ", async () => {
    renderWithProviders(<ChangePasswordForm />, { user: complete });
    await fill("stara-lozinka", "nova-lozinka", "druga-lozinka");
    expect(screen.getByText(t("user.passwordMismatch"))).toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("shows the server's reason", async () => {
    apiMock.put.mockRejectedValue(axiosError(400, "Current password is incorrect."));
    renderWithProviders(<ChangePasswordForm required />, { user: complete });
    expect(screen.getByText(t("user.passwordSectionRequired"))).toBeInTheDocument();
    await fill("pogresna", "nova-lozinka", "nova-lozinka");
    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
  });
});

describe("FormField", () => {
  it("marks a required field with an asterisk outside the accessible name", () => {
    renderWithProviders(
      <FormField label="Email" icon={Mail} required>
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.closest("label")?.querySelector("span")).toHaveClass("after:content-['*']");
  });
});
