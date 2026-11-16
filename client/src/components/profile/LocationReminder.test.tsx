import { screen } from "@testing-library/react";
import LocationReminder from "./LocationReminder.js";
import { makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { User } from "../../types/index.js";
import { useAuth } from "../../context/AuthContext.js";

// Shows the loaded user, so a test can wait until the reminder had its chance to appear.
function LoadedUser() {
  const { user } = useAuth();
  return user ? <span>{user.email}</span> : null;
}

const renderFor = (user: User) =>
  renderWithProviders(
    <>
      <LocationReminder />
      <LoadedUser />
    </>,
    { route: "/dashboard", path: "/dashboard", user },
  );

describe("LocationReminder", () => {
  it.each(["STORE", "RESTAURANT"] as const)("asks a %s without a pin to set it, linking to My profile", async (role) => {
    renderFor(makeUser({ role, latitude: null, longitude: null }));
    expect(await screen.findByText(t("location.reminder"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("location.reminderLink") })).toHaveAttribute(
      "href",
      "/my-profile#location",
    );
  });

  it("is gone once the pin is set", async () => {
    renderFor(makeUser({ role: "STORE", latitude: 43.85, longitude: 18.41 }));
    expect(await screen.findByText("amir@test.com")).toBeInTheDocument();
    expect(screen.queryByText(t("location.reminder"))).not.toBeInTheDocument();
  });

  it("is not shown to an admin", async () => {
    renderFor(makeUser({ role: "ADMIN" }));
    expect(await screen.findByText("amir@test.com")).toBeInTheDocument();
    expect(screen.queryByText(t("location.reminder"))).not.toBeInTheDocument();
  });
});
