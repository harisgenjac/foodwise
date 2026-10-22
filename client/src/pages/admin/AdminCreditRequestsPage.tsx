import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Check, Inbox, ListFilter, Tags, X } from "lucide-react";
import api from "../../api/axios.js";
import { useFetch } from "../../hooks/useFetch.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Modal from "../../components/product/Modal.js";
import Pagination from "../../components/admin/Pagination.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import { CREDIT_REQUEST_STATUS_STYLES, formatCreditMonth } from "../../utils/credits.js";
import type { AdminCreditRequest } from "../../types/index.js";

const MAX_NOTE_LENGTH = 500;

type Decision = { request: AdminCreditRequest; action: "approve" | "reject" };

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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: requests, total, loading, error, refetch } = useFetch<AdminCreditRequest>(
    "/admin/credits/requests",
    "requests",
    { type, status, user_id: userId, limit: ADMIN_PAGE_SIZE, offset },
  );
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;
  const requestStatuses = t("credits.requestStatuses", { returnObjects: true }) as Record<string, string>;
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const hasActiveFilters = Boolean(type || status);

  const openDecision = (request: AdminCreditRequest, action: Decision["action"]) => {
    setNote("");
    setDecision({ request, action });
  };

  const decide = async () => {
    if (!decision || busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/credits/requests/${decision.request.id}/${decision.action}`, { note });
      toast.success(t(decision.action === "approve" ? "admin.creditRequests.approved" : "admin.creditRequests.rejected"));
      setDecision(null);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const describe = (request: AdminCreditRequest) =>
    request.request_type === "SUBSCRIPTION"
      ? `${request.plan_name} · ${t("credits.profile.planCredits", { count: request.credits })}`
      : `+${t("credits.profile.creditsCount", { count: request.credits })}`;

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
                        {describe(request)} · {request.price} KM
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
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openDecision(request, "approve")}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
                          >
                            <Check className="h-4 w-4" />
                            {t("admin.creditRequests.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDecision(request, "reject")}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                            {t("admin.creditRequests.reject")}
                          </button>
                        </div>
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
        <Modal onClose={() => setDecision(null)}>
          <h3 className="text-lg font-bold text-gray-900">
            {t(decision.action === "approve" ? "admin.creditRequests.approveTitle" : "admin.creditRequests.rejectTitle")}
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            {t(decision.action === "approve" ? "admin.creditRequests.approveText" : "admin.creditRequests.rejectText", {
              user: decision.request.user_business_name || decision.request.user_email,
              what: `${requestTypes[decision.request.request_type]} (${describe(decision.request)})`,
              month: formatCreditMonth(decision.request.period_month, monthNames),
            })}
          </p>
          <label className="mt-4 block text-sm font-medium text-gray-700">
            {t("admin.creditRequests.note")}
            <textarea
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputStyle} mt-1.5 resize-none`}
            />
          </label>
          <p className="mt-1 text-xs text-gray-500">{t("admin.creditRequests.noteHint")}</p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setDecision(null)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("admin.common.cancel")}
            </button>
            <button
              type="button"
              onClick={decide}
              disabled={busy}
              className={`flex-1 cursor-pointer rounded-xl py-2.5 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
                decision.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {t(decision.action === "approve" ? "admin.creditRequests.approve" : "admin.creditRequests.reject")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminCreditRequestsPage;
