import { Fragment } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpDown } from "lucide-react";
import SortableHeader from "../admin/SortableHeader.js";
import { FilterField } from "../product/FilterBar.js";
import { inputStyle } from "../form/FormField.js";
import type { SortDir } from "../../hooks/useAdminPage.js";

// Where a column goes in the phone card: the title (top left), the status (a pill top right), a
// label/value row, the action buttons at the bottom, or nowhere.
export type CardRole = "title" | "status" | "field" | "actions" | "none";

export interface DataColumn<T> {
  id: string;
  // The column title; also the label of the card row.
  header: string;
  // The table cell's content.
  cell: (row: T) => ReactNode;
  // Extra classes for the th and the td (alignment, `hidden lg:table-cell`); `px-4 py-3` is added.
  className?: string;
  // Extra classes for the td only.
  cellClassName?: string;
  // Sortable by the server under this key (the header button and the phone "Sort by" select).
  sortKey?: string;
  // Default "field".
  card?: CardRole;
  // The card's content when it differs from the cell (shorter, a pill only, full-width buttons).
  // A field whose content is null, false or "" is left out of that card.
  cardCell?: (row: T) => ReactNode;
  // Not a column of the table, only part of the card.
  cardOnly?: boolean;
  // A field whose value needs the card's width (a usage bar, a list): the label above the value.
  cardStacked?: boolean;
}

export interface DataTableSort {
  sort: string;
  dir: SortDir | "";
  onSort: (key: string) => void;
  setSort: (key: string, dir: SortDir) => void;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string | number;
  // useAdminSort's result, when a column is sortable.
  sort?: DataTableSort;
  // Opens the row's page: a click on the table row, and the card's title as a link covering the card.
  rowHref?: (row: T) => string;
  // Extra classes for each tr (e.g. `align-top`).
  rowClassName?: string;
  // Names the table and the card list for screen readers and tests.
  label: string;
  // Classes of the outer element (e.g. its margin).
  className?: string;
  // Inside a white section card (company pages, UserCreditsPanel): the table has no frame of its own,
  // and the phone cards are lighter (no shadow). The table classes below then follow the page.
  embedded?: boolean;
  // The table's classes, when the page's table differs from the admin lists.
  theadClassName?: string;
  headCellClassName?: string;
  bodyCellClassName?: string;
  // data-testid of each table row and card (the row's own id, for tests).
  rowTestId?: (row: T) => string;
}

const isEmpty = (content: ReactNode) => content === null || content === undefined || content === false || content === "";

// An admin list defined once by its columns: a table from md up, and below md one card per row
// (the title, a status pill top right, label/value rows and full-width action buttons), so no column
// hides off-screen on a phone. A sortable table also gets a "Sort by" select above the cards, using
// the same URL params as the header buttons. Pagination stays the page's own, under this.
function DataTable<T>({
  rows,
  columns,
  rowKey,
  sort,
  rowHref,
  rowClassName = "",
  label,
  className = "",
  embedded = false,
  theadClassName = embedded
    ? "border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500"
    : "border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500",
  headCellClassName = embedded ? "px-3 py-2" : "px-4 py-3",
  bodyCellClassName = embedded ? "px-3 py-3" : "px-4 py-3",
  rowTestId,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tableColumns = columns.filter((column) => !column.cardOnly);
  const sortable = columns.filter((column) => column.sortKey);
  const role = (column: DataColumn<T>): CardRole => column.card ?? "field";
  const cardContent = (column: DataColumn<T>, row: T) => (column.cardCell ?? column.cell)(row);

  return (
    <div className={className}>
      {/* From md up: the table. */}
      <div
        className={`hidden overflow-x-auto md:block ${embedded ? "" : "rounded-2xl border border-gray-100 bg-white shadow-sm"}`}
      >
        <table aria-label={label} className="w-full text-left text-sm">
          <thead className={theadClassName}>
            <tr>
              {tableColumns.map((column) =>
                column.sortKey && sort ? (
                  <SortableHeader
                    key={column.id}
                    label={column.header}
                    sortKey={column.sortKey}
                    sort={sort.sort}
                    dir={sort.dir}
                    onSort={sort.onSort}
                    className={`${headCellClassName} ${column.className ?? ""}`}
                  />
                ) : (
                  <th key={column.id} className={`${headCellClassName} ${column.className ?? ""}`}>
                    {column.header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                data-testid={rowTestId?.(row)}
                onClick={rowHref ? () => navigate(rowHref(row)) : undefined}
                className={`${rowHref ? "cursor-pointer transition-colors hover:bg-gray-50" : ""} ${rowClassName}`}
              >
                {tableColumns.map((column) => (
                  <td key={column.id} className={`${bodyCellClassName} ${column.className ?? ""} ${column.cellClassName ?? ""}`}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below md: a "Sort by" select and one card per row. */}
      <div className="space-y-3 md:hidden">
        {sort && sortable.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <span className="shrink-0">{t("filters.sortBy")}</span>
            <FilterField icon={ArrowUpDown}>
              <select
                value={sort.sort ? `${sort.sort}:${sort.dir || "asc"}` : ""}
                onChange={(e) => {
                  const [key = "", dir] = e.target.value.split(":");
                  sort.setSort(key, dir === "desc" ? "desc" : "asc");
                }}
                className={inputStyle}
              >
                <option value="">{t("table.sortDefault")}</option>
                {sortable.flatMap((column) => [
                  <option key={`${column.id}:asc`} value={`${column.sortKey}:asc`}>
                    {t("table.sortAscending", { column: column.header })}
                  </option>,
                  <option key={`${column.id}:desc`} value={`${column.sortKey}:desc`}>
                    {t("table.sortDescending", { column: column.header })}
                  </option>,
                ])}
              </select>
            </FilterField>
          </label>
        )}

        <ul aria-label={label} className="space-y-3">
          {rows.map((row) => {
            const title = columns.find((column) => role(column) === "title");
            const status = columns.find((column) => role(column) === "status");
            const fields = columns
              .filter((column) => role(column) === "field")
              .map((column) => ({ column, content: cardContent(column, row) }))
              .filter(({ content }) => !isEmpty(content));
            const actions = columns
              .filter((column) => role(column) === "actions")
              .map((column) => ({ column, content: cardContent(column, row) }))
              .filter(({ content }) => !isEmpty(content));
            const href = rowHref?.(row);
            const statusContent = status ? cardContent(status, row) : null;
            return (
              <li
                key={rowKey(row)}
                data-testid="data-card"
                className={`relative rounded-2xl border border-gray-100 bg-white p-4 ${embedded ? "" : "shadow-sm"} ${href ? "transition-colors hover:bg-gray-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-sm">
                    {title &&
                      (href ? (
                        // The title's link covers the whole card (after:inset-0); other links and buttons sit above it.
                        <Link to={href} className="block after:absolute after:inset-0 after:rounded-2xl after:content-['']">
                          {cardContent(title, row)}
                        </Link>
                      ) : (
                        cardContent(title, row)
                      ))}
                  </div>
                  {!isEmpty(statusContent) && <div className="relative shrink-0">{statusContent}</div>}
                </div>
                {fields.length > 0 && (
                  <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
                    {fields.map(({ column, content }) =>
                      column.cardStacked ? (
                        <div key={column.id}>
                          <dt className="text-gray-500">{column.header}</dt>
                          <dd className="relative mt-1 text-gray-800">{content}</dd>
                        </div>
                      ) : (
                        <div key={column.id} className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-gray-500">{column.header}</dt>
                          <dd className="relative min-w-0 text-right text-gray-800">{content}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}
                {actions.length > 0 && (
                  <div className="relative mt-4 flex gap-2 *:flex-1">
                    {actions.map(({ column, content }) => (
                      <Fragment key={column.id}>{content}</Fragment>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default DataTable;
