import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import MyProfilePage from "./MyProfilePage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";

const restaurant = makeUser({
  role: "RESTAURANT",
  business_name: "Bistro Most",
  city: "Mostar",
  phone: "061222333",
  address: "Rondo 2",
});

const renderPage = () =>
  renderWithProviders(<MyProfilePage />, { route: "/my-profile", path: "/my-profile", user: restaurant });

describe("MyProfilePage feedback", () => {
  beforeEach(() => {
    // The credits section loads on its own; its requests are not part of these tests.
    vi.spyOn(console, "error").mockImplementation(() => {});
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

  const chooseLogo = async (container: HTMLElement) => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:logo" });
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
});
