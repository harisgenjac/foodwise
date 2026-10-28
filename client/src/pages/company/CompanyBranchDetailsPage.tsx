import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  CircleCheck,
  Clock,
  Eye,
  Hourglass,
  KeyRound,
  Leaf,
  Mail,
  MapPin,
  Package,
  PencilLine,
  Phone,
  Power,
  Store,
} from "lucide-react";
import api, { assetUrl } from "../../api/axios.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Breadcrumbs, { BreadcrumbPlaceholder } from "../../components/Breadcrumbs.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import DetailItem from "../../components/product/DetailItem.js";
import StatCard from "../../components/dashboard/StatCard.js";
import DashboardProductCard from "../../components/dashboard/DashboardProductCard.js";
import DashboardReservationCard from "../../components/dashboard/DashboardReservationCard.js";
import ConfirmModal from "../../components/common/ConfirmModal.js";
import SetPasswordModal from "../../components/admin/SetPasswordModal.js";
import EditBranchModal from "../../components/company/EditBranchModal.js";
import { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import LoadMore from "../../components/LoadMore.js";
import { useFetch } from "../../hooks/useFetch.js";
import { usePagedLimit } from "../../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../../utils/pagination.js";
import { BRANCH_STATUS_STYLES } from "../../utils/branches.js";
import { formatSavedFood } from "../../utils/savedFood.js";
import { formatDateTime } from "../../utils/admin.js";
import type { BranchDetails, Product, Reservation } from "../../types/index.js";

type Dialog = "edit" | "password" | "deactivate" | "reactivate" | null;
type Tab = "products" | "reservations";

const PRODUCT_STATUSES = ["Available", "Sold", "Expired"];
const RESERVATION_STATUSES = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];

const errorMessage = (err: unknown) => (axios.isAxiosError(err) ? err.response?.data?.error : null);

// The branch's products or reservations, read-only: the branch itself handles them.
function BranchActivity({ branchId, tab }: { branchId: number; tab: Tab }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  const isProducts = tab === "products";
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, status);
  // The page remounts this component per tab, so `tab` never changes within one instance.
  const list = useFetch<Product | Reservation>(`/company/branches/${branchId}/${tab}`, tab, { status, limit });
  const statuses = isProducts ? PRODUCT_STATUSES : RESERVATION_STATUSES;
  const labels = t(isProducts ? "productStatus" : "reservationStatus", { returnObjects: true }) as Record<string, string>;

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <FilterField icon={Eye}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t("company.branchDetails.statusFilter")}
            className={inputStyle}
          >
            <option value="">{t("company.branchDetails.allStatuses")}</option>
            {statuses.map((code) => (
              <option key={code} value={code}>
                {labels[code] ?? code}
              </option>
            ))}
          </select>
        </FilterField>
      </div>
      {list.loading ? (
        <LoadingSpinner />
      ) : list.error ? (
        <LoadErrorState />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={isProducts ? Package : CalendarCheck}
          title={t(isProducts ? "company.branchDetails.noProducts" : "company.branchDetails.noReservations")}
          subtitle={t("company.branchDetails.readOnly")}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isProducts
              ? (list.data as Product[]).map((product) => (
                  // An empty actions slot: no details link or buttons, the headquarters only reads.
                  <DashboardProductCard key={product.id} product={product} actions={<></>} />
                ))
              : (list.data as Reservation[]).map((reservation) => (
                  <DashboardReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    partyLabel={t("reservations.buyer")}
                    actions={<></>}
                  />
                ))}
          </div>
          <LoadMore shown={list.data.length} total={list.total ?? list.data.length} fetching={list.fetching} onLoadMore={loadMore} />
        </>
      )}
    </div>
  );
}

// A branch as its headquarters sees it: the data the headquarters manages (name, city, address,
// phone, login password), this month's numbers, read-only products and reservations, and
// deactivating or reactivating the branch.
function CompanyBranchDetailsPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [details, setDetails] = useState<BranchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("products");

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/company/branches/${id}`);
      setDetails({ branch: response.data.branch, stats: response.data.stats });
    } catch (err) {
      console.error(err);
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const closeDialog = () => setDialog(null);

  // One action at a time; the server's message (or refusal) is a toast, then a reload.
  const run = async (request: () => Promise<{ data: { message: string } }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await request();
      toast.success(response.data.message);
      closeDialog();
      await load();
    } catch (err) {
      toast.error(errorMessage(err) || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const section = { label: t("sidebar.companyBranches"), to: "/company/branches" };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl pb-16">
        <Breadcrumbs items={[section, { label: <BreadcrumbPlaceholder /> }]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-16">
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={Store}
          title={t("company.branchDetails.notFoundTitle")}
          subtitle={t("company.branchDetails.notFoundSubtitle")}
          action={{ to: "/company/branches", label: t("company.branchDetails.back") }}
        />
      </div>
    );
  }

  const { branch, stats } = details;
  const isDeactivated = branch.status === "deactivated";
  const savedFood = formatSavedFood(stats.saved_this_month, t("dashboard.piecesShort"));
  const staffName = `${branch.first_name ?? ""} ${branch.last_name ?? ""}`.trim();
  const secondaryButton =
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";
  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: "products", label: t("company.branchDetails.productsTab"), icon: Package },
    { key: "reservations", label: t("company.branchDetails.reservationsTab"), icon: CalendarCheck },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <Breadcrumbs items={[section, { label: branch.business_name }]} />

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-orange-100 text-orange-700">
              {branch.logo_url ? (
                <img src={assetUrl(branch.logo_url)} alt={branch.business_name} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-7 w-7" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">{branch.business_name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BRANCH_STATUS_STYLES[branch.status]}`}>
                  {t(`company.branchStatus.${branch.status}`)}
                </span>
                {branch.city && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {branch.city}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog("edit")} className={secondaryButton}>
              <PencilLine className="h-4 w-4" />
              {t("company.branchDetails.edit")}
            </button>
            <button type="button" onClick={() => setDialog("password")} className={secondaryButton}>
              <KeyRound className="h-4 w-4" />
              {t("company.branchDetails.setPassword")}
            </button>
          </div>
        </div>

        <p className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          {t("company.branchDetails.readOnly")}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            icon={MapPin}
            label={t("user.address")}
            value={[branch.address, branch.city].filter(Boolean).join(", ") || "—"}
          />
          <DetailItem icon={Phone} label={t("user.phone")} value={branch.phone || "—"} />
          <DetailItem icon={Mail} label={t("company.branchDetails.login")} value={branch.email} />
          <DetailItem icon={Clock} label={t("user.workingHours")} value={branch.opening_hours || "—"} />
          <DetailItem
            icon={CircleCheck}
            label={t("company.branchDetails.staff")}
            value={staffName || t("company.branchDetails.staffNotSet")}
          />
          <DetailItem icon={Clock} label={t("admin.userDetails.created")} value={formatDateTime(branch.created_at)} />
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          {t("company.branchDetails.statsSection")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Package} label={t("company.branchDetails.activeProducts")} value={stats.active_products} />
          <StatCard
            icon={Hourglass}
            label={t("company.branchDetails.pendingReservations")}
            value={stats.pending_reservations}
            tone="amber"
          />
          <StatCard
            icon={CircleCheck}
            label={t("company.branchDetails.completedThisMonth")}
            value={stats.completed_this_month}
            tone="green"
          />
          <StatCard
            icon={Leaf}
            label={t("company.branchDetails.savedThisMonth")}
            value={savedFood[0] ?? "0 kg"}
            units={savedFood.slice(1)}
            tone="green"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div role="tablist" className="inline-flex w-fit flex-wrap rounded-full border border-gray-100 bg-white p-1 shadow-sm">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? "bg-orange-500 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
        {/* A new instance per tab, so the status filter and paging start fresh. */}
        <BranchActivity key={tab} branchId={branch.id} tab={tab} />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Power className="h-4 w-4 text-orange-600" />
          {isDeactivated ? t("company.branchDetails.reactivateTitle") : t("company.branchDetails.deactivateTitle")}
        </h2>
        {isDeactivated ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              {t("company.branchDetails.deactivatedSince", {
                date: branch.deactivated_at ? formatDateTime(branch.deactivated_at) : "",
                by: branch.deactivated_by_email ?? "—",
              })}
            </p>
            <p className="mt-1 text-sm text-gray-600">{t("company.branchDetails.reactivateText")}</p>
            <button
              type="button"
              onClick={() => setDialog("reactivate")}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
            >
              <CircleCheck className="h-4 w-4" />
              {t("company.branchDetails.reactivate")}
            </button>
          </>
        ) : (
          <>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>{t("company.branchDetails.deactivateHidden")}</li>
              <li>{t("company.branchDetails.deactivatePending")}</li>
              <li>{t("company.branchDetails.deactivateConfirmed")}</li>
              <li>{t("company.branchDetails.deactivateLogin")}</li>
            </ul>
            <button
              type="button"
              onClick={() => setDialog("deactivate")}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              <Power className="h-4 w-4" />
              {t("company.branchDetails.deactivate")}
            </button>
          </>
        )}
      </section>

      {dialog === "edit" && (
        <EditBranchModal
          branch={branch}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            load();
          }}
        />
      )}

      {dialog === "password" && (
        <SetPasswordModal
          name={branch.business_name}
          busy={busy}
          onConfirm={(password) => run(() => api.patch(`/company/branches/${branch.id}/password`, { password }))}
          onClose={closeDialog}
        />
      )}

      {dialog === "deactivate" && (
        <ConfirmModal
          variant="danger"
          icon={Power}
          title={t("company.branchDetails.deactivateConfirmTitle")}
          message={t("company.branchDetails.deactivateConfirmText", { name: branch.business_name })}
          confirmLabel={t("company.branchDetails.deactivate")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={() => run(() => api.post(`/company/branches/${branch.id}/deactivate`))}
          onClose={closeDialog}
        />
      )}

      {dialog === "reactivate" && (
        <ConfirmModal
          variant="success"
          icon={CircleCheck}
          title={t("company.branchDetails.reactivateConfirmTitle")}
          message={t("company.branchDetails.reactivateConfirmText", { name: branch.business_name })}
          confirmLabel={t("company.branchDetails.reactivate")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={() => run(() => api.post(`/company/branches/${branch.id}/reactivate`))}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

export default CompanyBranchDetailsPage;
