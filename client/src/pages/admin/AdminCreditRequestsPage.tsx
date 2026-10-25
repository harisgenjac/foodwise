import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Inbox, ListFilter, Tags, X } from "lucide-react";
import { useFetch } from "../../hooks/useFetch.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import CreditRequestDecisionModal, {
  CreditRequestDecisionButtons,
  type CreditRequestAction,
} from "../../components/admin/CreditRequestDecisionModal.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import { CREDIT_REQUEST_STATUS_STYLES, describeCreditRequest, formatCreditMonth } from "../../utils/credits.js";
import type { AdminCreditRequest } from "../../types/index.js";

type Decision = { request: AdminCreditRequest; action: CreditRequestAction };

// Subscription and top-up requests, pending first. Payment is offline, so the admin approves a
// request once it is paid (or rejects it), with an internal note the user never sees.
function AdminCreditRequestsPage() {
  const { t } = useTranslation();
  // Set when coming from the credits overview (a user's pending requests).
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user_id") ?? "";
  const [type, setType] = useState("");
  // The overview links here with ?status=PENDING.
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [offset, setOffset] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const { data: requests, total, loading, error, refetch } = useFetch<AdminCreditRequest>(
    "/admin/credits/requests",
    "requests",
    { type, status, user_id: userId, limit: ADMIN_PAGE_SIZE, offset },
  );
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;
  const requestStatuses = t("credits.requestStatuses", { returnObjects: true }) as Record<string, string>;
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const hasActiveFilters = Boolean(type || status);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.creditRequests.title")}
        subtitle={t("admin.creditRequests.subtitle")}
        icon={Inbox}
        count={total === null ? undefined : t("admin.creditRequests.count", { count: total })}
      />

      {userId && (
        <p className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-2 text-sm text-orange-800">
          {t("admin.creditRequests.filteredByUser")}
          <button
            type="button"
            onClick={() => {
              setSearchParams({});
              setOffset(0);
            }}
            className="inline-flex cursor-pointer items-center gap-1 font-medium hover:underline"
          >
            <X className="h-4 w-4" />
            {t("admin.creditRequests.showAll")}
          </button>
        </p>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setType("");
          setStatus("");
          setOffset(0);
        }}
        columns={3}
      >
        <FilterField icon={Tags}>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setOffset(0);
            }}
            aria-label={t("admin.creditRequests.columnRequest")}
            className={inputStyle}
          >
            <option value="">{t("admin.creditRequests.allTypes")}</option>
            {Object.entries(requestTypes).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField icon={ListFilter}>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
            aria-label={t("admin.creditRequests.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.creditRequests.allStatuses")}</option>
            {Object.entries(requestStatuses).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t(hasActiveFilters || userId ? "admin.creditRequests.noResultsTitle" : "admin.creditRequests.emptyTitle")}
          subtitle={t(hasActiveFilters || userId ? "admin.creditRequests.noResultsSubtitle" : "admin.creditRequests.emptySubtitle")}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.creditRequests.columnUser")}</th>
                  <th className="px-4 py-3">{t("admin.creditRequests.columnRequest")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.creditRequests.columnMonth")}</th>
                  <th className="px-4 py-3">{t("admin.creditRequests.columnStatus")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((request) => (
                  <tr key={request.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${request.user_id}`} className="font-medium text-gray-900 hover:text-orange-600">
                        {request.user_business_name || request.user_email}
                      </Link>
                      <p className="text-xs text-gray-500">{formatDateTime(request.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{requestTypes[request.request_type]}</p>
                      <p className="text-xs text-gray-500">
                        {describeCreditRequest(request, t)} · {request.price} KM
                      </p>
                      {(request.auto_renew || request.source === "AUTO_RENEW") && (
                        <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {t(request.source === "AUTO_RENEW" ? "admin.creditRequests.renewal" : "admin.creditRequests.autoRenew")}
                        </span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 md:table-cell">
                      {formatCreditMonth(request.period_month, monthNames)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${CREDIT_REQUEST_STATUS_STYLES[request.status]}`}>
                        {requestStatuses[request.status] || request.status}
                      </span>
                      {request.reviewed_at && (
                        <p className="mt-1 text-xs text-gray-500">
                          {request.reviewed_by_email} · {formatDateTime(request.reviewed_at)}
                        </p>
                      )}
                      {request.admin_note && <p className="mt-1 text-xs italic text-gray-500">{request.admin_note}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {request.status === "PENDING" && (
                        <CreditRequestDecisionButtons onDecide={(action) => setDecision({ request, action })} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={setOffset} />
        </>
      )}

      {decision && (
        <CreditRequestDecisionModal
          request={decision.request}
          action={decision.action}
          onClose={() => setDecision(null)}
          onDone={refetch}
        />
      )}
    </div>
  );
}

export default AdminCreditRequestsPage;
