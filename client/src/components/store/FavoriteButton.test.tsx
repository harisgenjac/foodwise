import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FavoriteButton from "./FavoriteButton.js";
import { t } from "../../test/utils.js";

describe("FavoriteButton", () => {
  it("renders an accessible icon button that reflects the state", () => {
    const { rerender } = render(<FavoriteButton isFavorite={false} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: t("store.addToFavorites") })).toHaveAttribute("aria-pressed", "false");

    rerender(<FavoriteButton isFavorite onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: t("store.removeFromFavorites") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggles without triggering the card click underneath", async () => {
    const onToggle = vi.fn();
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <FavoriteButton isFavorite={false} onToggle={onToggle} />
      </div>,
    );

    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("shows a labelled pill variant", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FavoriteButton variant="pill" isFavorite={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: t("store.addToFavorites") }));
    expect(onToggle).toHaveBeenCalled();

    rerender(<FavoriteButton variant="pill" isFavorite onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: t("store.inFavorites") })).toBeInTheDocument();
  });
});
