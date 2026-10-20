import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Search, SearchX } from "lucide-react";
import Modal from "./Modal.js";
import EmptyState from "./EmptyState.js";
import FilterBar, { FilterField } from "./FilterBar.js";
import { t } from "../../test/utils.js";

describe("Modal", () => {
  it("closes on Escape and on a backdrop click, but not on a click inside", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("stops listening for Escape after unmount", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Modal onClose={onClose}>x</Modal>);
    unmount();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("EmptyState", () => {
  it("shows the title, subtitle and an optional action link", () => {
    const { rerender } = render(
      <MemoryRouter>
        <EmptyState icon={SearchX} title="Nema" subtitle="Pokušajte ponovo" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Nema" })).toBeInTheDocument();
    expect(screen.getByText("Pokušajte ponovo")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <EmptyState icon={SearchX} title="Nema" subtitle="x" action={{ to: "/browse-products", label: "Ponude" }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Ponude" })).toHaveAttribute("href", "/browse-products");
  });
});

describe("FilterBar", () => {
  it("shows the clear button only when filters are active", async () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterBar hasActiveFilters={false} onClear={onClear}>
        <FilterField icon={Search}>
          <input aria-label="filter" />
        </FilterField>
      </FilterBar>,
    );
    expect(screen.getByLabelText("filter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("filters.clear") })).not.toBeInTheDocument();

    rerender(
      <FilterBar hasActiveFilters onClear={onClear}>
        <input aria-label="filter" />
      </FilterBar>,
    );
    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
