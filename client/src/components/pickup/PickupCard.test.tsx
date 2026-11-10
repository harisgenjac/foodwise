import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n/config.js";
import PickupCard from "./PickupCard.js";
import { makeOrder } from "../../test/utils.js";

describe("PickupCard", () => {
  it("shows the pickup time on the 24-hour clock in English too", async () => {
    await i18n.changeLanguage("en");
    const order = makeOrder({ status: "Confirmed", pickup_at: new Date(2030, 2, 15, 14, 5).toISOString() });
    render(
      <MemoryRouter>
        <PickupCard order={order} isStore />
      </MemoryRouter>,
    );
    expect(screen.getByText("14:05")).toBeInTheDocument();
    expect(screen.queryByText(/\d (AM|PM)/)).not.toBeInTheDocument();
  });
});
