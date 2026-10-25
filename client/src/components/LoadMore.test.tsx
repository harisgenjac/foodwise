import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoadMore from "./LoadMore.js";
import { t } from "../test/utils.js";

describe("LoadMore", () => {
  it("shows how many are shown and loads a page on click", async () => {
    const onLoadMore = vi.fn();
    render(<LoadMore shown={12} total={40} fetching={false} onLoadMore={onLoadMore} />);

    expect(screen.getByText(t("common.showingOf", { shown: 12, total: 40 }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("is disabled while the next page loads", () => {
    render(<LoadMore shown={12} total={40} fetching onLoadMore={() => {}} />);
    expect(screen.getByRole("button", { name: t("common.loading") })).toBeDisabled();
  });

  it("is hidden once everything is shown", () => {
    const { container } = render(<LoadMore shown={40} total={40} fetching={false} onLoadMore={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
