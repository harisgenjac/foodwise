import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarCheck,
  CircleCheck,
  Clock,
  HeartHandshake,
  History,
  KeyRound,
  PencilLine,
  Lock,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  ShieldCheck,
  UserRound,
  UserRoundX,
} from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import EmptyState from "../../components/product/EmptyState.js";
import DetailItem from "../../components/product/DetailItem.js";
import StatCard from "../../components/dashboard/StatCard.js";
import Modal from "../../components/product/Modal.js";
import ReasonModal from "../../components/admin/ReasonModal.js";
import EditProfileModal from "../../components/admin/EditProfileModal.js";
import FormField, { inputStyle } from "../../components/form/FormField.js";
import { ROLE_STYLES, accountName, formatDateTime } from "../../utils/admin.js";
import { getAccountSetup } from "../../utils/accountSetup.js";
import type { AdminAction, AdminUserCounts, User } from "../../types/index.js";

type Dialog = "block" | "unblock" | "password" | "profile" | null;

const errorMessage = (err: unknown) => (axios.isAxiosError(err) ? err.response?.data?.error : null);

function AdminUserDetailsPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [counts, setCounts] = useState<AdminUserCounts | null>(null);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/admin/users/${id}`);
      setUser(response.data.user);
      setCounts(response.data.counts);
      setActions(response.data.actions);
    } catch (err) {
      console.error(err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const closeDialog = () => {
    setDialog(null);
    setPassword("");
    setPasswordRepeat("");
    setPasswordError("");
  };

  // Runs one admin action once (busy blocks double clicks), then reloads the user.
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

  const handlePasswordSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== passwordRepeat) {
      setPasswordError(t("admin.userDetails.passwordMismatch"));
      return;
    }
    run(() => api.patch(`/admin/users/${id}/password`, { password }));
  };

  if (loading) return <LoadingSpinner />;

  if (!user || !counts) {
    return (
      <EmptyState
        icon={UserRoundX}
        title={t("admin.userDetails.notFoundTitle")}
        subtitle={t("admin.userDetails.notFoundSubtitle")}
        action={{ to: "/admin/users", label: t("admin.userDetails.back") }}
      />
    );
  }

  const roles = t("admin.roles", { returnObjects: true }) as Record<string, string>;
  const actionTypes = t("admin.actionTypes", { returnObjects: true }) as Record<string, string>;
  const name = accountName(user);
  const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  const isOwnAccount = me?.id === user.id;
  const isBusiness = user.role !== "ADMIN";

  const secondaryButton =
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("admin.userDetails.back")}
      </Link>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES[user.role]}`}>
                {roles[user.role]}
              </span>
              {user.is_blocked ? (
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                  {t("admin.common.blocked")}
                </span>
              ) : getAccountSetup(user).missingFields.length > 0 ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  {t("admin.common.incompleteProfile")}
                </span>
              ) : null}
              {user.must_change_password && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {t("admin.common.pendingPassword")}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                {user.email}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog("profile")} className={secondaryButton}>
              <PencilLine className="h-4 w-4" />
              {t("admin.userDetails.editProfile")}
            </button>
            <button type="button" onClick={() => setDialog("password")} className={secondaryButton}>
              <KeyRound className="h-4 w-4" />
              {t("admin.userDetails.setPassword")}
            </button>
            {user.is_blocked ? (
              <button
                type="button"
                onClick={() => setDialog("unblock")}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                <CircleCheck className="h-4 w-4" />
                {t("admin.userDetails.unblock")}
              </button>
            ) : (
              !isOwnAccount && (
                <button
                  type="button"
                  onClick={() => setDialog("block")}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  <Ban className="h-4 w-4" />
                  {t("admin.userDetails.block")}
                </button>
              )
            )}
          </div>
        </div>

        {isOwnAccount && <p className="mt-4 text-sm text-gray-500">{t("admin.userDetails.ownAccount")}</p>}

        {user.is_blocked && (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">{t("admin.userDetails.blockedSection")}</p>
            <p className="mt-1">
              {t("admin.common.reasonLabel")}: {user.blocked_reason}
            </p>
            {user.blocked_at && (
              <p className="mt-1 text-xs text-red-600">
                {t("admin.userDetails.blockedAt")}: {formatDateTime(user.blocked_at)}
              </p>
            )}
          </div>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem icon={UserRound} label={t("admin.userDetails.name")} value={fullName || "—"} />
          {isBusiness && (
            <>
              <DetailItem icon={Building2} label={t("admin.userDetails.businessName")} value={user.business_name || "—"} />
              <DetailItem icon={MapPin} label={t("admin.userDetails.city")} value={user.city || "—"} />
              <DetailItem icon={Phone} label={t("admin.userDetails.phone")} value={user.phone || "—"} />
              <DetailItem icon={MapPin} label={t("admin.userDetails.address")} value={user.address || "—"} />
            </>
          )}
          <DetailItem
            icon={Clock}
            label={t("admin.userDetails.created")}
            value={user.created_at ? formatDateTime(user.created_at) : "—"}
          />
        </dl>
      </section>

      {isBusiness && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              {t("admin.userDetails.statsSection")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {user.role === "STORE" && (
                <Link to={`/admin/products?store_id=${user.id}`} className={secondaryButton}>
                  <Package className="h-4 w-4" />
                  {t("admin.userDetails.viewProducts")}
                </Link>
              )}
              <Link to={`/admin/reservations?user_id=${user.id}`} className={secondaryButton}>
                <CalendarCheck className="h-4 w-4" />
                {t("admin.userDetails.viewReservations")}
              </Link>
              <Link to={`/admin/donations?donor_id=${user.id}`} className={secondaryButton}>
                <HeartHandshake className="h-4 w-4" />
                {t("admin.userDetails.viewDonations")}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {user.role === "STORE" && (
              <>
                <StatCard icon={Package} label={t("admin.userDetails.products")} value={counts.products} />
                <StatCard icon={PackageCheck} label={t("admin.userDetails.activeProducts")} value={counts.active_products} tone="green" />
              </>
            )}
            <StatCard icon={CalendarCheck} label={t("admin.userDetails.reservations")} value={counts.reservations} />
            <StatCard icon={Clock} label={t("admin.userDetails.pendingReservations")} value={counts.pending_reservations} tone="amber" />
            <StatCard icon={CircleCheck} label={t("admin.userDetails.completedReservations")} value={counts.completed_reservations} tone="green" />
            <StatCard icon={HeartHandshake} label={t("admin.userDetails.donations")} value={counts.donations} />
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <History className="h-4 w-4 text-orange-600" />
          {t("admin.userDetails.historySection")}
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
                    {(action.product_name || action.donation_name) && (
                      <span className="font-normal text-gray-600">: {action.product_name || action.donation_name}</span>
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

      {dialog === "profile" && (
        <EditProfileModal
          user={user}
          name={name}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            load();
          }}
        />
      )}

      {dialog === "block" && (
        <ReasonModal
          title={t("admin.userDetails.blockTitle")}
          text={t("admin.userDetails.blockText", { name })}
          confirmLabel={t("admin.userDetails.confirmBlock")}
          busy={busy}
          onConfirm={(reason) => run(() => api.post(`/admin/users/${id}/block`, { reason }))}
          onClose={closeDialog}
        />
      )}

      {dialog === "unblock" && (
        <Modal onClose={closeDialog}>
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.userDetails.unblockTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.userDetails.unblockText", { name })}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={closeDialog} className={secondaryButton}>
              {t("admin.common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => api.post(`/admin/users/${id}/unblock`))}
              className="cursor-pointer rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              {t("admin.userDetails.confirmUnblock")}
            </button>
          </div>
        </Modal>
      )}

      {dialog === "password" && (
        <Modal onClose={closeDialog}>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t("admin.userDetails.passwordTitle")}</h2>
              <p className="mt-1 text-sm text-gray-600">{t("admin.userDetails.passwordText", { name })}</p>
            </div>
            <FormField label={t("admin.userDetails.newPassword")} icon={Lock}>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                className={inputStyle}
              />
            </FormField>
            <FormField label={t("admin.userDetails.confirmPassword")} icon={Lock}>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordRepeat}
                onChange={(e) => {
                  setPasswordRepeat(e.target.value);
                  setPasswordError("");
                }}
                className={inputStyle}
              />
            </FormField>
            <p className={`text-xs ${passwordError ? "text-red-600" : "text-gray-500"}`}>
              {passwordError || t("auth.passwordHint")}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeDialog} className={secondaryButton}>
                {t("admin.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
              >
                {t("admin.userDetails.savePassword")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default AdminUserDetailsPage;
