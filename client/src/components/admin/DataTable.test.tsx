import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DataTable, { type DataColumn, type DataTableSort } from "./DataTable.js";
import { LocationDisplay, t } from "../../test/utils.js";

interface Row {
  id: number;
  name: string;
  status: string;
  used: number;
  company: string | null;
}

const ROWS: Row[] = [
  { id: 1, name: "Market Centar", status: "Na čekanju", used: 12, company: "Bingo" },
  { id: 2, name: "Pekara Ilidža", status: "Odobreno", used: 3, company: null },
];

const onApprove = vi.fn();

const COLUMNS: DataColumn<Row>[] = [
  { id: "name", header: "Korisnik", card: "title", cell: (row) => <strong>{row.name}</strong> },
  {
    id: "status",
    header: "Status",
    card: "status",
    cell: (row) => `${row.status} (detalji)`,
    cardCell: (row) => <span data-testid="pill">{row.status}</span>,
  },
  { id: "used", header: "Potrošeno", sortKey: "used", className: "text-right", cellClassName: "tabular-nums", cell: (row) => row.used },
  { id: "company", header: "Firma", className: "hidden lg:table-cell", cell: (row) => row.company ?? "" },
  { id: "bar", header: "Potrošnja", sortKey: "usage", card: "none", cell: () => <div data-testid="bar" /> },
  { id: "note", header: "Bilješka", cardOnly: true, cell: (row) => (row.id === 1 ? "Plaćeno" : null) },
  {
    id: "actions",
    header: "",
    card: "actions",
    cell: (row) => <button type="button">Odobri {row.name}</button>,
    cardCell: (row) =>
      row.status === "Na čekanju" && (
        <button type="button" onClick={() => onApprove(row.id)}>
          Odobri karticu {row.name}
        </button>
      ),
  },
];

const renderTable = (props: { sort?: DataTableSort; rowHref?: (row: Row) => string } = {}) =>
  render(
    <MemoryRouter initialEntries={["/list"]}>
      <Routes>
        <Route path="/list" element={<DataTable label="Lista" rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} {...props} />} />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );

const cards = () => within(screen.getByRole("list", { name: "Lista" })).getAllByTestId("data-card");

describe("DataTable", () => {
  it("shows the table from md up and the cards below md", () => {
    renderTable();
    const table = screen.getByRole("table", { name: "Lista" });
    expect(table.parentElement).toHaveClass("hidden", "md:block", "overflow-x-auto");
    expect(screen.getByRole("list", { name: "Lista" }).parentElement).toHaveClass("md:hidden");
  });

  it("renders the table from the columns, with their classes, and leaves card-only columns out", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Korisnik",
      "Status",
      "Potrošeno",
      "Firma",
      "Potrošnja",
      "",
    ]);
    expect(within(table).getByRole("columnheader", { name: "Firma" })).toHaveClass("px-4", "py-3", "hidden", "lg:table-cell");
    const [first] = within(table).getAllByRole("row").slice(1);
    const cells = within(first!).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("Na čekanju (detalji)");
    expect(cells[2]).toHaveClass("px-4", "py-3", "text-right", "tabular-nums");
    expect(within(table).queryByText("Plaćeno")).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Odobri Market Centar" })).toBeInTheDocument();
  });

  it("builds each card: title, status pill top right, label/value rows without empty ones, actions at the bottom", async () => {
    renderTable();
    const [first, second] = cards();
    expect(within(first!).getByText("Market Centar")).toBeInTheDocument();
    expect(within(first!).getByTestId("pill")).toHaveTextContent("Na čekanju");
    // The fields with their column title as the label; the bar column is not in the card.
    const terms = within(first!).getAllByRole("term").map((dt) => dt.textContent);
    expect(terms).toEqual(["Potrošeno", "Firma", "Bilješka"]);
    expect(within(first!).getByText("Plaćeno")).toBeInTheDocument();
    expect(within(first!).queryByTestId("bar")).not.toBeInTheDocument();
    // No company and no note on the second row: those rows are left out.
    expect(within(second!).getAllByRole("term").map((dt) => dt.textContent)).toEqual(["Potrošeno"]);

    // The actions use the card's version, in a full-width row.
    const action = within(first!).getByRole("button", { name: "Odobri karticu Market Centar" });
    expect(action.parentElement).toHaveClass("flex", "*:flex-1");
    await userEvent.click(action);
    expect(onApprove).toHaveBeenCalledWith(1);
    expect(within(second!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the row's page from the table row and from the card's title link", async () => {
    renderTable({ rowHref: (row) => `/users/${row.id}` });
    const card = cards()[1]!;
    const link = within(card).getByRole("link", { name: "Pekara Ilidža" });
    expect(link).toHaveAttribute("href", "/users/2");
    // The link covers the card.
    expect(link).toHaveClass("after:absolute", "after:inset-0");

    await userEvent.click(within(screen.getByRole("table")).getByText("Market Centar"));
    expect(screen.getByTestId("location")).toHaveTextContent("/users/1");
  });

  it("sorts from the table headers and, below md, from a Sort by select with the same keys", async () => {
    const sort: DataTableSort = { sort: "used", dir: "desc", onSort: vi.fn(), setSort: vi.fn() };
    renderTable({ sort });
    await userEvent.click(within(screen.getByRole("columnheader", { name: /Potrošnja/ })).getByRole("button"));
    expect(sort.onSort).toHaveBeenCalledWith("usage");

    const select = screen.getByRole("combobox", { name: t("filters.sortBy") });
    expect(select).toHaveValue("used:desc");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      t("table.sortDefault"),
      t("table.sortAscending", { column: "Potrošeno" }),
      t("table.sortDescending", { column: "Potrošeno" }),
      t("table.sortAscending", { column: "Potrošnja" }),
      t("table.sortDescending", { column: "Potrošnja" }),
    ]);
    await userEvent.selectOptions(select, "usage:asc");
    expect(sort.setSort).toHaveBeenLastCalledWith("usage", "asc");
    await userEvent.selectOptions(select, "");
    expect(sort.setSort).toHaveBeenLastCalledWith("", "asc");
  });

  it("has no Sort by select without sorting", () => {
    renderTable();
    expect(screen.queryByRole("combobox", { name: t("filters.sortBy") })).not.toBeInTheDocument();
  });
});
