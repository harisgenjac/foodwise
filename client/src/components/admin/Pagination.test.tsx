import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "./Pagination.js";
import { t } from "../../test/utils.js";

const pageButtons = () =>
  within(screen.getByRole("navigation"))
    .getAllByRole("button")
    .filter((button) => /^\d+$/.test(button.textContent ?? ""))
    .map((button) => button.textContent);

describe("Pagination", () => {
  it("shows the range and every page when there are few", () => {
    render(<Pagination total={45} limit={10} offset={10} onChange={() => {}} />);

    expect(screen.getByText(t("admin.common.range", { from: 11, to: 20, total: 45 }))).toBeInTheDocument();
    expect(pageButtons()).toEqual(["1", "2", "3", "4", "5"]);
    expect(screen.getByRole("button", { name: t("admin.common.page", { page: 2 }) })).toHaveAttribute("aria-current", "page");
  });

  it("puts an ellipsis around the current page when there are many", () => {
    render(<Pagination total={200} limit={10} offset={90} onChange={() => {}} />);
    expect(pageButtons()).toEqual(["1", "9", "10", "11", "20"]);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("reports the offset of the chosen page", async () => {
    const onChange = vi.fn();
    render(<Pagination total={45} limit={10} offset={10} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: t("admin.common.page", { page: 4 }) }));
    expect(onChange).toHaveBeenLastCalledWith(30);
    await userEvent.click(screen.getByRole("button", { name: t("admin.common.previous") }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    await userEvent.click(screen.getByRole("button", { name: t("admin.common.next") }));
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("disables previous on the first page and next on the last", () => {
    const { rerender } = render(<Pagination total={25} limit={10} offset={0} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: t("admin.common.previous") })).toBeDisabled();
    rerender(<Pagination total={25} limit={10} offset={20} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: t("admin.common.next") })).toBeDisabled();
  });

  it("is hidden when everything fits on one page", () => {
    const { container } = render(<Pagination total={10} limit={10} offset={0} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
