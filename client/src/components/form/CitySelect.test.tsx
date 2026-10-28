import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CitySelect from "./CitySelect.js";
import { CITIES, apiMock, mockGet } from "../../test/utils.js";

const citiesCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/cities");

describe("CitySelect", () => {
  it("lists the cities in the server's order after the empty option", async () => {
    mockGet({ "/cities": { cities: CITIES } });
    render(<CitySelect value="" onChange={() => {}} emptyLabel="Izaberite grad" aria-label="Grad" />);

    await screen.findByRole("option", { name: "Žepče" });
    expect(screen.getAllByRole("option").map((option) => [option.textContent, option.getAttribute("value")])).toEqual([
      ["Izaberite grad", ""],
      ["Sarajevo", "1"],
      ["Tuzla", "2"],
      ["Zenica", "3"],
      ["Žepče", "4"],
    ]);
    expect(screen.getByLabelText("Grad")).toHaveDisplayValue("Izaberite grad");
  });

  it("shows the selected city and reports the chosen id", async () => {
    mockGet({ "/cities": { cities: CITIES } });
    const onChange = vi.fn();
    render(<CitySelect value="2" onChange={onChange} emptyLabel="-- Svi gradovi --" aria-label="Grad" />);

    const select = screen.getByLabelText("Grad");
    await waitFor(() => expect(select).toHaveDisplayValue("Tuzla"));
    await userEvent.selectOptions(select, "Zenica");
    expect(onChange).toHaveBeenCalledWith("3");
    await userEvent.selectOptions(select, "-- Svi gradovi --");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("fetches the list once for every select in the session", async () => {
    mockGet({ "/cities": { cities: CITIES } });
    const { unmount } = render(
      <>
        <CitySelect value="" onChange={() => {}} emptyLabel="A" aria-label="Prvi" />
        <CitySelect value="" onChange={() => {}} emptyLabel="B" aria-label="Drugi" />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("option", { name: "Tuzla" })).toHaveLength(2));
    unmount();

    render(<CitySelect value="" onChange={() => {}} emptyLabel="C" aria-label="Treći" />);
    await screen.findByRole("option", { name: "Tuzla" });
    expect(citiesCalls()).toHaveLength(1);
  });

  it("tries again on the next mount after a failed request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet({ "/cities": new Error("network") });
    const { unmount } = render(<CitySelect value="" onChange={() => {}} emptyLabel="A" aria-label="Grad" />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getAllByRole("option")).toHaveLength(1);
    unmount();

    mockGet({ "/cities": { cities: CITIES } });
    render(<CitySelect value="" onChange={() => {}} emptyLabel="A" aria-label="Grad" />);
    await screen.findByRole("option", { name: "Tuzla" });
    expect(citiesCalls()).toHaveLength(2);
  });
});
