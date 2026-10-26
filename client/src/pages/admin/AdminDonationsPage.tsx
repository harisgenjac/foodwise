import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Gift, HeartHandshake, ListFilter, Search, Trash2, X } from "lucide-react";
import api from "../../api/axios.js";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import { useDonationLabels } from "../../hooks/useDonationLabels.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import ConfirmModal from "../../components/common/ConfirmModal.js";
import { DONATION_STATUS_STYLES, DONATION_TYPE_STYLES } from "../../utils/donations.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { ADMIN_PAGE_SIZE } from "../../utils/admin.js";
import type { AdminDonation } from "../../types/index.js";

function AdminDonationsPage() {
  const { t } = useTranslation();
  const labels = useDonationLabels();
  // Set when coming from a user's page ("User's donations").
  const [searchParams, setSearchParams] = useSearchParams();
  const donorId = searchParams.get("donor_id") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const [selected, setSelected] = useState<AdminDonation | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: donations, total, loading, error, refetch } = useFetch<AdminDonation>("/admin/donations", "donations", {
    q,
    status,
    type,
    donor_id: donorId,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  useKeepPageInRange(page, total, setPage);

  const hasActiveFilters = Boolean(q || status || type);
  const filter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const removeDonation = async (reason: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.delete(`/admin/donations/${selected.id}`, { data: { reason } });
      toast.success(t("admin.donations.removed"));
      setSelected(null);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.donations.title")}
        subtitle={t("admin.donations.subtitle")}
        icon={HeartHandshake}
        count={total === null ? undefined : t("admin.donations.count", { count: total })}
      />

      {donorId && (
        <p className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-2 text-sm text-orange-800">
          {t("admin.donations.filteredByUser")}
          <button
            type="button"
            onClick={() => {
              setSearchParams({});
            }}
            className="inline-flex cursor-pointer items-center gap-1 font-medium hover:underline"
          >
            <X className="h-4 w-4" />
            {t("admin.donations.showAll")}
          </button>
        </p>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ("");
          setStatus("");
          setType("");
          setPage(1);
        }}
        columns={3}
      >
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => filter(setQ)(e.target.value)}
            placeholder={t("admin.donations.search")}
            aria-label={t("admin.donations.search")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={Gift}>
          <select
            value={type}
            onChange={(e) => filter(setType)(e.target.value)}
            aria-label={t("admin.donations.columnType")}
            className={inputStyle}
          >
            <option value="">{t("admin.donations.allTypes")}</option>
            {Object.entries(labels.typeBadges).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField icon={ListFilter}>
          <select
            value={status}
            onChange={(e) => filter(setStatus)(e.target.value)}
            aria-label={t("admin.donations.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.donations.allStatuses")}</option>
            {Object.entries(labels.statuses).map(([code, label]) => (
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
      ) : donations.length === 0 ? (
        hasActiveFilters || donorId ? (
          <EmptyState icon={HeartHandshake} title={t("admin.donations.noResultsTitle")} subtitle={t("admin.donations.noResultsSubtitle")} />
        ) : (
          <EmptyState icon={HeartHandshake} title={t("admin.donations.emptyTitle")} subtitle={t("admin.donations.emptySubtitle")} />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.donations.columnDonation")}</th>
                  <th className="px-4 py-3">{t("admin.donations.columnDonor")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.donations.columnType")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.donations.columnExpiry")}</th>
                  <th className="px-4 py-3">{t("admin.donations.columnStatus")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {donations.map((donation) => (
                  <tr key={donation.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{donation.name}</p>
                      <p className="text-xs text-gray-500">
                        {parseFloat(donation.quantity)} {labels.units[donation.unit] || donation.unit}
                        {" · "}
                        {labels.categories[donation.category] || donation.category}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${donation.donor_id}`} className="font-medium text-gray-900 hover:text-orange-600">
                        {donation.business_name || donation.donor_email}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DONATION_TYPE_STYLES[donation.donation_type]}`}>
                        {labels.typeBadges[donation.donation_type]}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{formatDisplayDate(donation.expiry_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DONATION_STATUS_STYLES[donation.status]}`}>
                        {labels.statuses[donation.status] || donation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {donation.status !== "Removed" && (
                        <button
                          type="button"
                          onClick={() => setSelected(donation)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("admin.common.remove")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}

      {selected && (
        <ConfirmModal
          variant="danger"
          reason
          title={t("admin.donations.removeTitle")}
          message={t("admin.donations.removeText", { name: selected.name })}
          confirmLabel={t("admin.common.remove")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={removeDonation}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default AdminDonationsPage;
