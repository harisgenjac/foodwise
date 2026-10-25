import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddDonationPage from "./AddDonationPage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";
import { dateInDays } from "../utils/expiry.js";
import type { User } from "../types/index.js";

const renderPage = (user: User = makeUser({ role: "STORE" })) =>
  renderWithProviders(<AddDonationPage />, {
    route: "/donate-food/new",
    path: "/donate-food/new",
    user,
  });

const field = (key: string) => screen.getByLabelText(t(key), { exact: false });

const fillBasics = async () => {
  await userEvent.type(field("donations.form.name"), "Hljeb");
  await userEvent.click(screen.getByRole("button", { name: t("categories.Bakery") }));
  await userEvent.type(field("donations.form.originalPrice"), "2");
  await userEvent.type(field("donations.form.quantity"), "20");
  await userEvent.selectOptions(field("donations.form.unit"), "kom");
  await userEvent.click(screen.getByRole("button", { name: t("product.expiresTomorrow") }));
};

describe("AddDonationPage", () => {
  it("publishes a free donation without a price and returns to the list", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Donation published successfully." } });
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });

    expect(screen.queryByLabelText(t("donations.form.donationPrice"), { exact: false })).not.toBeInTheDocument();
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));

    expect(apiMock.post).toHaveBeenCalledWith(
      "/donations",
      expect.objectContaining({
        donation_type: "FREE",
        name: "Hljeb",
        category: "Bakery",
        donation_price: null,
        expiry_date: dateInDays(1),
        allergens: [],
        pickup_from: null,
      }),
    );
    expect(await screen.findByTestId("location")).toHaveTextContent("/donate-food");
  });

  it("asks for a donation price lower than the value on a paid donation", async () => {
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });
    await userEvent.click(screen.getByRole("radio", { name: new RegExp(t("donations.types.SPONSORED")) }));
    await fillBasics();

    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));
    const price = field("donations.form.donationPrice");
    expect(price).toHaveAccessibleDescription(t("common.fieldRequired"));
    expect(price).toHaveFocus();

    await userEvent.type(price, "3");
    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));
    expect(price).toHaveAccessibleDescription(t("donations.form.priceInvalid"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("requires the donation price only for a paid donation", async () => {
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });
    expect(screen.queryByLabelText(t("donations.form.donationPrice"), { exact: false })).not.toBeInTheDocument();
    expect(field("donations.form.originalPrice")).toHaveAttribute("aria-required", "true");

    await userEvent.click(screen.getByRole("radio", { name: new RegExp(t("donations.types.SPONSORED")) }));
    expect(field("donations.form.donationPrice")).toHaveAttribute("aria-required", "true");
    expect(field("donations.form.donationPrice").closest("label")?.querySelector("span")).toHaveClass("after:content-['*']");

    await userEvent.click(screen.getByRole("radio", { name: new RegExp(t("donations.types.FREE")) }));
    expect(screen.queryByLabelText(t("donations.form.donationPrice"), { exact: false })).not.toBeInTheDocument();
  });

  it("marks the empty required fields on submit and sends nothing", async () => {
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });
    expect(screen.queryByText(t("common.fieldRequired"))).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));
    // Name, category, value, quantity, unit and the last day.
    expect(screen.getAllByText(t("common.fieldRequired"))).toHaveLength(6);
    expect(field("donations.form.name")).toHaveFocus();
    expect(field("donations.form.description")).not.toHaveAttribute("aria-invalid");
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("flags a pickup window that ends before it starts", async () => {
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });
    await fillBasics();
    await userEvent.type(field("donations.form.pickupFrom"), "18:00");
    await userEvent.type(field("donations.form.pickupUntil"), "09:00");
    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));

    expect(field("donations.form.pickupUntil")).toHaveAccessibleDescription(t("donations.form.invalidPickup"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("starts a restaurant on meals in portions and sends the meal details", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderPage(makeUser({ role: "RESTAURANT" }));
    await screen.findByText(t("donations.form.mealSection"));

    expect(field("donations.form.unit")).toHaveValue("portion");
    await userEvent.type(field("donations.form.name"), "Grah");
    await userEvent.type(field("donations.form.originalPrice"), "8");
    await userEvent.type(field("donations.form.quantity"), "10");
    await userEvent.click(screen.getByRole("button", { name: t("product.expiresToday") }));
    await userEvent.click(screen.getByRole("button", { name: t("donations.allergens.celery") }));
    await userEvent.selectOptions(field("donations.form.temperature"), "HOT");
    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));

    expect(apiMock.post).toHaveBeenCalledWith(
      "/donations",
      expect.objectContaining({
        category: "Meals",
        unit: "portion",
        allergens: ["celery"],
        serving_temperature: "HOT",
      }),
    );
  });

  it("hides the meal details for other categories", async () => {
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });
    expect(screen.queryByText(t("donations.form.mealSection"))).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("donations.categories.Meals") }));
    expect(screen.getByText(t("donations.form.mealSection"))).toBeInTheDocument();
  });

  it("shows the server error and stays on the form", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(400, "Expiry date cannot be in the past."));
    renderPage();
    await screen.findByText(t("donations.form.addTitle"), { selector: "h1" });
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: t("donations.form.submitAdd") }));

    expect(await screen.findByText("Expiry date cannot be in the past.", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });
});
