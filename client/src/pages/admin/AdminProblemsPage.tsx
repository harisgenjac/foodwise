import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ListFilter, MessageSquareWarning, PencilLine } from "lucide-react";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import DataTable, { type DataColumn } from "../../components/common/DataTable.js";
import ProblemReplyModal from "../../components/admin/ProblemReplyModal.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import { formatOrderCode } from "../../utils/orders.js";
import { PROBLEM_STATUSES, PROBLEM_STATUS_STYLES } from "../../utils/problems.js";
import type { AdminOrderProblem } from "../../types/index.js";

// The restaurants' problem reports (GET /admin/problems), newest first: the order (linked to the
// admin's order page), both businesses, the reason, the text, the status and when it was reported.
// "Obradi" opens a modal to set the status and reply (PATCH /admin/problems/:id). For now the admin
// handles them; later the delivery service's customer support will.
function AdminProblemsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const [handling, setHandling] = useState<AdminOrderProblem | null>(null);
  const { data: problems, total, loading, error, refetch } = useFetch<AdminOrderProblem>("/admin/problems", "problems", {
    status,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  useKeepPageInRange(page, total, setPage);

  const statusPill = (problem: AdminOrderProblem) => (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${PROBLEM_STATUS_STYLES[problem.status]}`}>
      {t(`orders.problems.statuses.${problem.status}`)}
    </span>
  );
  const answer = (problem: AdminOrderProblem) =>
    (problem.admin_reply || problem.resolved_at) && (
      <>
        {problem.admin_reply && <p className="mt-1 text-xs italic text-neutral-500">{problem.admin_reply}</p>}
        {problem.resolved_at && (
          <p className="mt-1 text-xs text-neutral-500">
            {t("admin.problems.resolvedBy", {
              email: problem.resolved_by_email ?? "–",
              time: formatDateTime(problem.resolved_at),
            })}
          </p>
        )}
      </>
    );
  const handleButton = (problem: AdminOrderProblem, card = false) => (
    <button
      type="button"
      onClick={() => setHandling(problem)}
      className={
        card
          ? "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-brand-200 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50"
          : "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
      }
    >
      <PencilLine className="h-4 w-4" />
      {t("admin.problems.handle")}
    </button>
  );

  const columns: DataColumn<AdminOrderProblem>[] = [
    {
      id: "order",
      header: t("admin.problems.columnOrder"),
      card: "title",
      cell: (problem) => (
        <>
          <Link to={`/admin/orders/${problem.order_id}`} className="font-mono font-semibold text-neutral-900 hover:text-brand-900">
            {formatOrderCode(problem.order_code)}
          </Link>
          <p className="text-xs text-neutral-500">{t(`admin.problems.method.${problem.fulfilment_method}`)}</p>
        </>
      ),
    },
    {
      id: "restaurant",
      header: t("admin.problems.columnRestaurant"),
      cell: (problem) => (
        <Link to={`/admin/users/${problem.restaurant_id}`} className="font-medium text-neutral-800 hover:text-brand-900">
          {problem.restaurant_name ?? problem.restaurant_email}
        </Link>
      ),
    },
    {
      id: "store",
      header: t("admin.problems.columnStore"),
      className: "hidden md:table-cell",
      cell: (problem) => (
        <Link to={`/admin/users/${problem.store_id}`} className="text-neutral-700 hover:text-brand-900">
          {problem.store_name ?? problem.store_email}
        </Link>
      ),
    },
    {
      id: "reason",
      header: t("admin.problems.columnReason"),
      cell: (problem) => <span className="font-medium text-neutral-800">{t(`orders.problems.reasons.${problem.reason}`)}</span>,
    },
    {
      id: "text",
      header: t("admin.problems.columnText"),
      cardStacked: true,
      cell: (problem) =>
        problem.text ? (
          <p className="max-w-xs whitespace-pre-line text-sm text-neutral-700">{problem.text}</p>
        ) : (
          <span className="text-sm text-neutral-400">{t("admin.problems.noText")}</span>
        ),
    },
    {
      id: "status",
      header: t("admin.problems.columnStatus"),
      card: "status",
      cell: (problem) => (
        <>
          {statusPill(problem)}
          {answer(problem)}
        </>
      ),
      cardCell: statusPill,
    },
    {
      id: "answer",
      header: t("admin.problems.reply"),
      cardOnly: true,
      cardStacked: true,
      cell: answer,
    },
    {
      id: "time",
      header: t("admin.problems.columnTime"),
      cellClassName: "whitespace-nowrap text-neutral-600",
      cell: (problem) => formatDateTime(problem.created_at),
    },
    {
      id: "actions",
      header: "",
      card: "actions",
      cellClassName: "whitespace-nowrap text-right",
      cell: (problem) => handleButton(problem),
      cardCell: (problem) => <div className="flex">{handleButton(problem, true)}</div>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.problems.title")}
        subtitle={t("admin.problems.subtitle")}
        icon={MessageSquareWarning}
        count={total === null ? undefined : t("admin.problems.count", { count: total })}
      />

      <FilterBar
        hasActiveFilters={Boolean(status)}
        activeCount={status ? 1 : 0}
        resultCount={total ?? undefined}
        onClear={() => {
          setStatus("");
          setPage(1);
        }}
        columns={3}
      >
        <FilterField icon={ListFilter}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label={t("admin.problems.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.problems.allStatuses")}</option>
            {PROBLEM_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`orders.problems.statuses.${value}`)}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : problems.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title={t(status ? "admin.problems.noResultsTitle" : "admin.problems.emptyTitle")}
          subtitle={t(status ? "admin.problems.noResultsSubtitle" : "admin.problems.emptySubtitle")}
        />
      ) : (
        <>
          <DataTable
            label={t("admin.problems.title")}
            rows={problems}
            rowKey={(problem) => problem.id}
            rowClassName="align-top"
            columns={columns}
          />
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}

      {handling && <ProblemReplyModal problem={handling} onClose={() => setHandling(null)} onDone={refetch} />}
    </div>
  );
}

export default AdminProblemsPage;
