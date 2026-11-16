import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import MyProfilePage from "./MyProfilePage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { LocationMapProps } from "../components/profile/LocationMap.js";

// Leaflet does not run in jsdom: a stand-in map that shows the pin and the centre and places a pin
// like a click on the real map.
vi.mock("../components/profile/LocationMap.js", () => ({
  default: ({ value, center, onChange }: LocationMapProps) => (
    <div>
      <span data-testid="map-center">{`${center.latitude},${center.longitude}`}</span>
      <span data-testid="map-pin">{value ? `${value.latitude},${value.longitude}` : "none"}</span>
      <button type="button" onClick={() => onChange({ latitude: 44.21, longitude: 17.91 })}>
        map click
      </button>
    </div>
  ),
}));

const restaurant = makeUser({
  role: "RESTAURANT",
  business_name: "Bistro Most",
  city: "Zenica",
  city_id: 3,
  phone: "061222333",
  address: "Rondo 2",
});

const renderPage = () =>
  renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user: restaurant });

describe("MyProfilePage feedback", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("has no subscription or credits section: restaurants pay no credits", async () => {
    renderPage();
    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();
    expect(screen.queryByText(t("credits.profile.title"))).not.toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalledWith("/credits/plans");
  });

  it("confirms a saved profile with a toast", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated." } });
    const success = vi.spyOn(toast, "success");
    renderPage();

    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));

    await waitFor(() => expect(success).toHaveBeenCalledWith(t("user.editedSuccess")));
    expect(screen.queryByText(t("user.editedSuccess"))).not.toBeInTheDocument();
  });

  it("shows the server's reason in a toast when saving fails", async () => {
    apiMock.put.mockRejectedValue(axiosError(400, "Phone number is not valid."));
    const errorToast = vi.spyOn(toast, "error");
    renderPage();

    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Phone number is not valid."));
    expect(screen.queryByText("Phone number is not valid.")).not.toBeInTheDocument();
  });

  it("picks the city from the list and sends its id", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated." } });
    renderPage();

    const city = await screen.findByLabelText(t("cities.label"));
    await waitFor(() => expect(city).toHaveDisplayValue("Zenica"));
    expect(screen.getByText("Rondo 2, Zenica")).toBeInTheDocument();

    await userEvent.selectOptions(city, "Tuzla");
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith("/users/me", expect.objectContaining({ city_id: 2 })),
    );
  });

  it("requires a city like the other required fields", async () => {
    renderWithProviders(<MyProfilePage />, {
      route: "/my-profile",
      path: "/my-profile",
      user: { ...restaurant, city: undefined, city_id: null },
    });

    const city = await screen.findByLabelText(t("cities.label"));
    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();
    expect(city).toHaveDisplayValue(t("cities.choose"));
    expect(city).toHaveAttribute("aria-required", "true");

    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    expect(city).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(city).toHaveFocus();
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  const chooseLogo = async (container: HTMLElement) => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:logo", revokeObjectURL: vi.fn() });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File(["logo"], "logo.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: t("user.saveImage") }));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirms an uploaded logo with a toast", async () => {
    apiMock.post.mockResolvedValue({ data: { logo_url: "/uploads/logos/1.png" } });
    const success = vi.spyOn(toast, "success");
    const { container } = renderPage();
    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();

    await chooseLogo(container);
    await waitFor(() => expect(success).toHaveBeenCalledWith(t("user.addedLogoSuccess")));
  });

  it("shows the server's reason in a toast when the logo upload fails", async () => {
    apiMock.post.mockRejectedValue(axiosError(400, "Only image files are allowed."));
    const errorToast = vi.spyOn(toast, "error");
    const { container } = renderPage();
    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();

    await chooseLogo(container);
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Only image files are allowed."));
  });

  it("offers only the server's image types and refuses any other file before the preview", async () => {
    const createObjectURL = vi.fn(() => "blob:logo");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const errorToast = vi.spyOn(toast, "error");
    const { container } = renderPage();
    expect(await screen.findByDisplayValue("Bistro Most")).toBeInTheDocument();

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    // The accept attribute is only a hint to the file picker, so the page checks the type itself.
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(input, new File(["<svg onload=alert(1)>"], "logo.svg", { type: "image/svg+xml" }));

    expect(errorToast).toHaveBeenCalledWith(t("user.invalidImageType"));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: t("user.saveImage") })).not.toBeInTheDocument();
  });
});

describe("MyProfilePage for a branch", () => {
  const branch = makeUser({
    role: "STORE",
    business_name: "Bingo Visoko",
    city: "Sarajevo",
    city_id: 1,
    phone: "032 400",
    address: "Titova 1",
    company_id: 3,
    company_name: "Bingo d.o.o.",
    company_logo_url: "/uploads/logos/company-3.png",
    company_description: "Lanac prodavnica",
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the business name and city read-only and leaves them out of the save", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully." } });
    renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user: branch });

    const name = await screen.findByDisplayValue("Bingo Visoko");
    expect(name).toBeDisabled();
    expect(screen.getByLabelText(t("cities.label"))).toBeDisabled();
    expect(screen.getAllByText(t("user.managedByCompany"))).toHaveLength(2);
    // Without its own logo and description, the company's are shown.
    expect(screen.getByText(new RegExp(t("user.usesCompanyLogo")))).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Lanac prodavnica")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    const body = apiMock.put.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("business_name");
    expect(body).not.toHaveProperty("city_id");
    expect(body).toMatchObject({ address: "Titova 1", phone: "032 400" });
  });

  it("removes its own logo", async () => {
    apiMock.delete.mockResolvedValue({ data: { message: "Logo removed." } });
    renderWithProviders(<MyProfilePage />, {
      route: "/my-profile",
      path: "/my-profile",
      user: { ...branch, logo_url: "/uploads/logos/own.png" },
    });
    await userEvent.click(await screen.findByRole("button", { name: t("user.removeLogo") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/users/me/logo");
    expect(await screen.findByText(new RegExp(t("user.usesCompanyLogo")))).toBeInTheDocument();
  });
});

describe("MyProfilePage weekly hours and cover", () => {
  const store = makeUser({
    role: "STORE",
    business_name: "Market Centar",
    city: "Sarajevo",
    city_id: 1,
    phone: "033 111",
    address: "Titova 1",
    opening_hours: "07-22 svaki dan",
  });
  const renderStore = (user = store) =>
    renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the old text as a hint and sends no weekly hours until they are entered", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully." } });
    renderStore();
    expect(await screen.findByText(t("schedule.legacyHint", { text: "07-22 svaki dan" }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    const body = apiMock.put.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("opening_schedule");
    expect(body).not.toHaveProperty("pickup_schedule");
    expect(body).not.toHaveProperty("opening_hours");
  });

  it("sends the weekly hours once entered (a closed Sunday)", async () => {
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully." } });
    renderStore();
    await screen.findByDisplayValue("Market Centar");
    const [opening] = screen.getAllByLabelText(t("schedule.openOn", { day: t("schedule.days.sun") }));
    await userEvent.click(opening!);
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    const body = apiMock.put.mock.calls[0]![1] as { opening_schedule: Record<string, unknown> };
    expect(body.opening_schedule).toMatchObject({ mon: { open: "08:00", close: "20:00" }, sun: null });
    expect(body).not.toHaveProperty("pickup_schedule");
  });

  it("gives a restaurant no pickup hours", async () => {
    renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user: restaurant });
    await screen.findByDisplayValue("Bistro Most");
    expect(screen.getAllByRole("group", { name: t("user.workingHours") })).toHaveLength(1);
    expect(screen.queryByRole("group", { name: t("user.pickupHours") })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(t("cover.upload"))).not.toBeInTheDocument();
  });

  it("uploads and removes the store's cover image", async () => {
    apiMock.post.mockResolvedValue({ data: { cover_url: "/uploads/covers/2-1-ab.png" } });
    apiMock.delete.mockResolvedValue({ data: { message: "Naslovna slika je uklonjena." } });
    renderStore();
    await screen.findByDisplayValue("Market Centar");
    await userEvent.upload(screen.getByLabelText(t("cover.upload")), new File(["x"], "c.png", { type: "image/png" }));
    expect(apiMock.post).toHaveBeenCalledWith("/users/me/cover", expect.any(FormData));
    expect(await screen.findByAltText(t("cover.alt"))).toHaveAttribute("src", expect.stringContaining("/uploads/covers/"));

    await userEvent.click(screen.getByRole("button", { name: t("cover.remove") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/users/me/cover");
    await waitFor(() => expect(screen.queryByAltText(t("cover.alt"))).not.toBeInTheDocument());
  });
});

describe("MyProfilePage location", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.put.mockResolvedValue({ data: { message: "Profile updated successfully." } });
  });

  it("shows the saved pin and sends it with the profile", async () => {
    renderWithProviders(<MyProfilePage />, {
      route: "/my-profile",
      path: "/my-profile",
      user: { ...restaurant, latitude: 44.2, longitude: 17.9 },
    });
    expect(await screen.findByTestId("map-pin")).toHaveTextContent("44.2,17.9");
    expect(screen.getByText(t("location.set"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith(
        "/users/me",
        expect.objectContaining({ location: { latitude: 44.2, longitude: 17.9 } }),
      ),
    );
  });

  it("starts the map at the chosen city, sets the pin with a click, and sends null after removing it", async () => {
    renderPage();
    expect(await screen.findByText(t("location.missing"))).toBeInTheDocument();
    // Zenica (city_id 3) from the city list.
    await waitFor(() => expect(screen.getByTestId("map-center")).toHaveTextContent("44.2017,17.9078"));

    await userEvent.click(screen.getByRole("button", { name: "map click" }));
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenLastCalledWith(
        "/users/me",
        expect.objectContaining({ location: { latitude: 44.21, longitude: 17.91 } }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: t("location.remove") }));
    await userEvent.click(screen.getByRole("button", { name: t("user.saveButton") }));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenLastCalledWith("/users/me", expect.objectContaining({ location: null })),
    );
  });
});
