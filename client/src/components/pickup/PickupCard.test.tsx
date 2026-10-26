import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n/config.js";
import PickupCard from "./PickupCard.js";
import { makeReservation } from "../../test/utils.js";

describe("PickupCard", () => {
  it("shows the pickup time on the 24-hour clock in English too", async () => {
    await i18n.changeLanguage("en");
    const reservation = makeReservation({ status: "Confirmed", pickup_date: new Date(2030, 2, 15, 14, 5).toISOString() });
    render(
      <MemoryRouter>
        <PickupCard reservation={reservation} isStore />
      </MemoryRouter>,
    );
    expect(screen.getByText("14:05")).toBeInTheDocument();
    expect(screen.queryByText(/PM/)).not.toBeInTheDocument();
  });
});
