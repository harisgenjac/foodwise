import { render, screen } from "@testing-library/react";
import UnitChips from "./UnitChips.js";

describe("UnitChips", () => {
  it("shows one chip per unit, in order", () => {
    render(<UnitChips units={["12 l", "40 kom"]} />);

    expect(screen.getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["12 l", "40 kom"]);
  });

  it("renders nothing without other units", () => {
    const { container } = render(<UnitChips units={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
