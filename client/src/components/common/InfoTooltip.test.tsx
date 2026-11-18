import { fireEvent, render, screen } from "@testing-library/react";
import { Cloud, Coins } from "lucide-react";
import InfoTooltip from "./InfoTooltip.js";

const renderTwo = () =>
  render(
    <div>
      <div className="relative">
        <InfoTooltip icon={Cloud} title="Manje CO₂" text="Procjena CO₂." label="Kako se računa CO₂" />
      </div>
      <div className="relative">
        <InfoTooltip icon={Coins} title="Ušteđeno" text="Razlika u cijeni." label="Kako se računa ušteda" />
      </div>
      <p>Izvan</p>
    </div>,
  );

const card = (name: string) =>
  screen.getAllByRole("tooltip", { hidden: true }).find((node) => node.textContent?.includes(name))!;
const isOpen = (name: string) => card(name).getAttribute("data-open") === "true";

describe("InfoTooltip", () => {
  it("is a labelled button described by its card", () => {
    renderTwo();
    const button = screen.getByRole("button", { name: "Kako se računa CO₂" });
    expect(button).toHaveAccessibleDescription("Manje CO₂ Procjena CO₂.");
    expect(card("Procjena")).toHaveAttribute("role", "tooltip");
    expect(isOpen("Procjena")).toBe(false);
    expect(card("Procjena")).toHaveClass("invisible");
  });

  it("opens on focus and closes on Escape", () => {
    renderTwo();
    const button = screen.getByRole("button", { name: "Kako se računa CO₂" });
    fireEvent.focus(button);
    expect(isOpen("Procjena")).toBe(true);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(card("Procjena")).toHaveClass("visible");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(isOpen("Procjena")).toBe(false);
  });

  it("opens on tap and closes on a tap outside", () => {
    renderTwo();
    fireEvent.click(screen.getByRole("button", { name: "Kako se računa ušteda" }));
    expect(isOpen("Razlika")).toBe(true);

    fireEvent.pointerDown(screen.getByText("Izvan"));
    expect(isOpen("Razlika")).toBe(false);
  });

  it("opens on hover and closes when the pointer leaves", () => {
    renderTwo();
    const button = screen.getByRole("button", { name: "Kako se računa CO₂" });
    fireEvent.mouseEnter(button);
    expect(isOpen("Procjena")).toBe(true);
    fireEvent.mouseLeave(button);
    expect(isOpen("Procjena")).toBe(false);
  });

  it("keeps only one open at a time", () => {
    renderTwo();
    fireEvent.click(screen.getByRole("button", { name: "Kako se računa CO₂" }));
    fireEvent.click(screen.getByRole("button", { name: "Kako se računa ušteda" }));
    expect(isOpen("Razlika")).toBe(true);
    expect(isOpen("Procjena")).toBe(false);
    expect(screen.getAllByRole("tooltip", { hidden: true }).filter((node) => node.dataset.open === "true")).toHaveLength(1);
  });
});
