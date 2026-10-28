import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  Ban,
  Building2,
  CircleCheck,
  Clock,
  FileText,
  History,
  KeyRound,
  Link2,
  PencilLine,
  Power,
  ShieldCheck,
  Store,
} from "lucide-react";
import api, { assetUrl } from "../../api/axios.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Breadcrumbs, { BreadcrumbPlaceholder } from "../../components/Breadcrumbs.js";
import EmptyState from "../../components/product/EmptyState.js";
import DetailItem from "../../components/product/DetailItem.js";
import ConfirmModal from "../../components/common/ConfirmModal.js";
import EditCompanyModal from "../../components/admin/EditCompanyModal.js";
import AttachStoreModal from "../../components/admin/AttachStoreModal.js";
import { BRANCH_STATUS_STYLES } from "../../utils/branches.js";
import { formatDateTime } from "../../utils/admin.js";
import type { AdminCompanyDetails } from "../../types/index.js";

type Dialog =
  | "block"
  | "unblock"
  | "edit"
  | "attach"
  | { kind: "deactivate" | "reactivate"; branch: AdminCompanyDetails["branches"][number] }
  | null;

const errorMessage = (err: unknown) => (axios.isAxiosError(err) ? err.response?.data?.error : null);

function AdminCompanyDetailsPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [details, setDetails] = useState<AdminCompanyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/admin/companies/${id}`);
      setDetails(response.data);
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

  // Runs one admin action once (busy blocks double clicks), then reloads the company.
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

  const section = { label: t("sidebar.adminCompanies"), to: "/admin/companies" };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl pb-16">
        <Breadcrumbs items={[section, { label: <BreadcrumbPlaceholder /> }]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-16">
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={Building2}
          title={t("admin.companyDetails.notFoundTitle")}
          subtitle={t("admin.companyDetails.notFoundSubtitle")}
          action={{ to: "/admin/companies", label: t("admin.companyDetails.back") }}
        />
      </div>
    );
  }

  const { company, hqUsers, branches, actions } = details;
  const actionTypes = t("admin.actionTypes", { returnObjects: true }) as Record<string, string>;
  const secondaryButton =
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <Breadcrumbs items={[section, { label: company.name }]} />

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-600">
              {company.logo_url ? (
                <img src={assetUrl(company.logo_url)} alt={company.name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-6 w-6" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">{company.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {company.is_blocked ? (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                    {t("admin.common.blocked")}
                  </span>
                ) : (
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                    {t("admin.common.active")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog("edit")} className={secondaryButton}>
              <PencilLine className="h-4 w-4" />
              {t("admin.companyDetails.edit")}
            </button>
            {company.is_blocked ? (
              <button
                type="button"
                onClick={() => setDialog("unblock")}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                <CircleCheck className="h-4 w-4" />
                {t("admin.companyDetails.unblock")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDialog("block")}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                <Ban className="h-4 w-4" />
                {t("admin.companyDetails.block")}
              </button>
            )}
          </div>
        </div>

        {company.is_blocked && (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">{t("admin.companyDetails.blockedSection")}</p>
            <p className="mt-1">
              {t("admin.common.reasonLabel")}: {company.blocked_reason}
            </p>
            {company.blocked_at && (
              <p className="mt-1 text-xs text-red-600">
                {t("admin.userDetails.blockedAt")}: {formatDateTime(company.blocked_at)}
              </p>
            )}
          </div>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
          <DetailItem icon={Building2} label={t("admin.companyDetails.name")} value={company.name} />
          <DetailItem
            icon={Clock}
            label={t("admin.userDetails.created")}
            value={company.created_at ? formatDateTime(company.created_at) : "—"}
          />
          <div className="sm:col-span-2">
            <DetailItem
              icon={FileText}
              label={t("admin.companyDetails.description")}
              value={company.description || "—"}
              valueClassName="whitespace-pre-line font-normal text-gray-900"
            />
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <KeyRound className="h-4 w-4 text-orange-600" />
          {t("admin.companyDetails.hqSection")}
        </h2>
        {hqUsers.length === 0 ? (
          <p className="text-sm text-gray-500">—</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {hqUsers.map((hq) => {
              const fullName = `${hq.first_name ?? ""} ${hq.last_name ?? ""}`.trim();
              return (
                <li key={hq.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link to={`/admin/users/${hq.id}`} className="font-medium text-gray-900 hover:text-orange-600">
                      {hq.email}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {[fullName, hq.phone].filter(Boolean).join(" · ") || t("admin.companyDetails.profileNotFilled")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hq.is_blocked && (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                        {t("admin.common.blocked")}
                      </span>
                    )}
                    {hq.must_change_password && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {t("admin.common.pendingPassword")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <Store className="h-4 w-4 text-orange-600" />
          {t("admin.companyDetails.branchesSection")}
        </h2>
        {branches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
            <p className="font-medium text-gray-700">{t("admin.companyDetails.noBranchesTitle")}</p>
            <p className="mt-1 text-sm text-gray-500">{t("admin.companyDetails.noBranchesSubtitle")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {branches.map((branch) => (
              <li key={branch.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/admin/users/${branch.id}`} className="min-w-0 hover:text-orange-600">
                  <p className="truncate font-medium text-gray-900">{branch.business_name || branch.email}</p>
                  <p className="text-sm text-gray-500">
                    {[branch.city, t("company.branches.activeProducts", { count: branch.active_products })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BRANCH_STATUS_STYLES[branch.status]}`}>
                    {t(`company.branchStatus.${branch.status}`)}
                  </span>
                  {branch.status === "deactivated" ? (
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: "reactivate", branch })}
                      className={secondaryButton}
                    >
                      {t("company.branchDetails.reactivate")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: "deactivate", branch })}
                      className={secondaryButton}
                    >
                      {t("company.branchDetails.deactivate")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setDialog("attach")} className={`${secondaryButton} mt-4`}>
          <Link2 className="h-4 w-4" />
          {t("admin.companyDetails.attachButton")}
        </button>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <History className="h-4 w-4 text-orange-600" />
          {t("admin.companyDetails.historySection")}
        </h2>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-500">{t("admin.userDetails.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {actions.map((action) => (
              <li key={action.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {actionTypes[action.action] ?? action.action}
                    {action.target_business_name && (
                      <span className="font-normal text-gray-600">: {action.target_business_name}</span>
                    )}
                  </p>
                  {action.reason && <p className="mt-0.5 text-sm text-gray-600">{action.reason}</p>}
                </div>
                <p className="shrink-0 text-xs text-gray-500 sm:text-right">
                  {formatDateTime(action.created_at)}
                  <br />
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    {action.admin_email}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog === "edit" && (
        <EditCompanyModal
          company={company}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            load();
          }}
        />
      )}

      {dialog === "attach" && (
        <AttachStoreModal
          companyId={company.id}
          companyName={company.name}
          onClose={closeDialog}
          onAttached={() => {
            closeDialog();
            load();
          }}
        />
      )}

      {dialog !== null && typeof dialog === "object" && (
        <ConfirmModal
          variant={dialog.kind === "deactivate" ? "danger" : "success"}
          icon={dialog.kind === "deactivate" ? Power : CircleCheck}
          title={t(
            dialog.kind === "deactivate"
              ? "company.branchDetails.deactivateConfirmTitle"
              : "company.branchDetails.reactivateConfirmTitle",
          )}
          message={t(
            dialog.kind === "deactivate"
              ? "admin.companyDetails.deactivateBranchText"
              : "company.branchDetails.reactivateConfirmText",
            { name: dialog.branch.business_name ?? dialog.branch.email },
          )}
          confirmLabel={t(
            dialog.kind === "deactivate" ? "company.branchDetails.deactivate" : "company.branchDetails.reactivate",
          )}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={() =>
            run(() => api.post(`/admin/companies/${company.id}/branches/${dialog.branch.id}/${dialog.kind}`))
          }
          onClose={closeDialog}
        />
      )}

      {dialog === "block" && (
        <ConfirmModal
          variant="danger"
          icon={Ban}
          reason
          title={t("admin.companyDetails.blockTitle")}
          message={t("admin.companyDetails.blockText", { name: company.name })}
          confirmLabel={t("admin.companyDetails.confirmBlock")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={(reason) => run(() => api.post(`/admin/companies/${id}/block`, { reason }))}
          onClose={closeDialog}
        />
      )}

      {dialog === "unblock" && (
        <ConfirmModal
          variant="success"
          icon={ShieldCheck}
          title={t("admin.companyDetails.unblockTitle")}
          message={t("admin.companyDetails.unblockText", { name: company.name })}
          confirmLabel={t("admin.companyDetails.confirmUnblock")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={() => run(() => api.post(`/admin/companies/${id}/unblock`))}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

export default AdminCompanyDetailsPage;
