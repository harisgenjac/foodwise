import { render, screen } from "@testing-library/react";
import Logo from "./Logo.js";

describe("Logo", () => {
  it("names the mark and the icon for screen readers, unless decorative", () => {
    const { unmount } = render(<Logo variant="mark" />);
    expect(screen.getByRole("img", { name: "Još vrijedi" })).toHaveAttribute("data-testid", "logo-mark");
    unmount();

    render(<Logo variant="icon" className="h-8 w-8" />);
    const icon = screen.getByRole("img", { name: "Još vrijedi" });
    expect(icon).toHaveAttribute("data-testid", "logo-icon");
    expect(icon).toHaveClass("h-8", "w-8");
  });

  it("hides a decorative mark", () => {
    render(<Logo variant="mark" decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("logo-mark")).toHaveAttribute("aria-hidden", "true");
  });

  it("writes the name as text next to a hidden mark, Još in brand and vrijedi in accent", () => {
    render(<Logo variant="full" textClassName="text-2xl" />);
    const full = screen.getByTestId("logo-full");
    expect(full).toHaveTextContent("Još vrijedi");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Još")).toHaveClass("text-brand-800");
    expect(screen.getByText("vrijedi")).toHaveClass("text-accent-700");
    expect(screen.getByText("Još").parentElement).toHaveClass("text-2xl", "font-bold");
  });
});
