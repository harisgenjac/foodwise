import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarRange, ChevronDown, Coins, PlusCircle, Wallet } from "lucide-react";
import api from "../../api/axios.js";
import { useCredits } from "../../context/CreditsContext.js";
import SubscribeModal from "./SubscribeModal.js";
import TopupModal from "./TopupModal.js";
import ConfirmModal from "../common/ConfirmModal.js";
import AutoRenewTooltip from "./AutoRenewTooltip.js";
import LoadMore from "../LoadMore.js";
import { usePagedLimit } from "../../hooks/usePagedLimit.js";
import { LIST_PAGE_SIZE } from "../../utils/pagination.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import {
  CREDIT_REQUEST_STATUS_STYLES,
  SUBSCRIPTION_SECTION,
  TOPUP_SECTION,
  formatCreditMonth,
  nextCreditMonth,
} from "../../utils/credits.js";
import type { CreditRequest, Plan, Role, TopupPackage } from "../../types/index.js";

const cardStyle = "rounded-2xl border border-gray-100 bg-white p-6 shadow-sm";
const PLAN_OPTIONS = "plan-options";
const TOPUP_OPTIONS = "topup-options";

interface ToggleButtonProps {
  open: boolean;
  controls: string;
  onClick: () => void;
  // Orange when the user should act (no plan after this month), else a quiet outline.
  prominent?: boolean;
  children: React.ReactNode;
}

function ToggleButton({ open, controls, onClick, prominent = false, children }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      className={`inline-flex w-fit shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
        prominent
          ? "bg-orange-500 text-white hover:bg-orange-600"
          : "border border-gray-200 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

// My profile for stores and restaurants: the current plan and balance, choosing a plan (this
// month while there is none, else the next month), auto-renew, extra credits (only with an active
// subscription) and the status of the user's requests. Payment is offline: every choice is a
// request an admin approves. The two sections have ids so banners and errors can link to them.
// With a subscription, next month's plans and the extra credits sit behind toggles that start
// closed (extra credits open at 0 credits), open from #subscription / #topup links and close
// again after a request is sent.
function SubscriptionSection({ role }: { role: Role }) {
  const { t } = useTranslation();
  const { credits, refresh } = useCredits();
  const { hash } = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [requestsFetching, setRequestsFetching] = useState(false);
  // The newest 10 requests, then 10 more per "Load more"; reloads keep the current limit.
  const { limit: requestsLimit, loadMore: loadMoreRequests } = usePagedLimit(LIST_PAGE_SIZE);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedTopup, setSelectedTopup] = useState<TopupPackage | null>(null);
  const [busy, setBusy] = useState(false);
  // Withdrawing an automatic renewal request drops it for good (the renewal job never recreates
  // it), so it is confirmed first.
  const [withdrawingRenewal, setWithdrawingRenewal] = useState<CreditRequest | null>(null);
  // Next month's plans and the extra credits stay collapsed until asked for; null means the
  // extra credits follow the default (open only when no credits are left).
  const [planOpen, setPlanOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState<boolean | null>(null);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;
  const requestStatuses = t("credits.requestStatuses", { returnObjects: true }) as Record<string, string>;

  const loadRequests = useCallback(async () => {
    setRequestsFetching(true);
    try {
      const response = await api.get("/credits/requests", { params: { limit: requestsLimit } });
      setRequests(response.data.requests);
      setRequestsTotal(response.data.total);
    } catch (err) {
      console.error("Error loading credit requests:", err);
    } finally {
      setRequestsFetching(false);
    }
  }, [requestsLimit]);

  useEffect(() => {
    Promise.all([api.get("/credits/plans"), api.get("/credits/topup-packages")])
      .then(([planResponse, packageResponse]) => {
        setPlans(planResponse.data.plans);
        setPackages(packageResponse.data.packages);
      })
      .catch((err) => console.error("Error loading plans:", err));
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Links like /my-profile#topup open their section and scroll to it once it is on the page.
  useEffect(() => {
    if (!credits || !hash) return;
    const section = hash.slice(1);
    if (section === TOPUP_SECTION) setTopupOpen(true);
    if (section === SUBSCRIPTION_SECTION) setPlanOpen(true);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [credits, hash]);

  if (!credits) return null;

  const reload = async () => {
    await Promise.all([refresh(), loadRequests()]);
  };

  const subscription = credits.subscription;
  // Without a subscription the request is for this month; with one, a plan change for the next.
  const period = subscription ? "next" : "current";
  const requestMonth = period === "current" ? credits.periodStart : nextCreditMonth(credits.periodStart);
  const pendingSubscription = credits.pendingRequests.find(
    (request) => request.request_type === "SUBSCRIPTION" && request.period_month === requestMonth,
  );
  const pendingTopup = credits.pendingRequests.find((request) => request.request_type === "TOPUP");
  const canChoosePlan = !pendingSubscription && !(period === "next" && credits.nextSubscription);
  // Without a subscription the plans are the point of the card; with one they are optional.
  const planCollapsible = period === "next" && canChoosePlan;
  const showPlans = canChoosePlan && (!planCollapsible || planOpen);
  const showTopups = topupOpen ?? credits.available === 0;

  const requestLabel = (request: CreditRequest) =>
    request.request_type === "SUBSCRIPTION"
      ? `${requestTypes.SUBSCRIPTION} ${request.plan_name ?? ""} · ${t("credits.profile.planCredits", { count: request.credits })}`
      : `${requestTypes.TOPUP} · +${t("credits.profile.creditsCount", { count: request.credits })}`;

  const withdraw = async (request: CreditRequest) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/credits/requests/${request.id}`);
      toast.success(t("credits.profile.withdrawn"));
      setWithdrawingRenewal(null);
      await reload();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("credits.profile.requestError"));
    } finally {
      setBusy(false);
    }
  };

  const requestWithdraw = (request: CreditRequest) => {
    if (request.source === "AUTO_RENEW") {
      setWithdrawingRenewal(request);
      return;
    }
    withdraw(request);
  };

  // Nothing is withdrawn: the switch also applies to next month's approved plan and pending
  // requests, which stay, so it needs no confirmation.
  const toggleAutoRenew = async () => {
    if (busy || !subscription) return;
    setBusy(true);
    try {
      const next = !subscription.auto_renew;
      const response = await api.patch("/credits/subscription/auto-renew", { auto_renew: next });
      // Turned on in the last days of the month, the renewal request is sent at once.
      toast.success(
        response.data?.renewalCreated
          ? t("credits.profile.autoRenewOnRenewalSent", {
              month: formatCreditMonth(nextCreditMonth(credits.periodStart), monthNames),
            })
          : t(next ? "credits.profile.autoRenewOn" : "credits.profile.autoRenewOff"),
      );
      await reload();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("credits.profile.requestError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section id={SUBSCRIPTION_SECTION} className={`${cardStyle} scroll-mt-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Coins className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t("credits.profile.title")}</h2>
              <p className="text-sm text-gray-500">{t("credits.profile.subtitle")}</p>
            </div>
          </div>
          <Link to="/credits" className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700">
            {t("credits.profile.viewCredits")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Wallet className="h-3.5 w-3.5" />
              {t("credits.profile.currentPlan")}
            </dt>
            <dd className="mt-1 font-semibold text-gray-900">
              {subscription ? subscription.plan_name : t("credits.profile.noPlan")}
            </dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <CalendarRange className="h-3.5 w-3.5" />
              {t("credits.profile.period")}
            </dt>
            <dd className="mt-1 font-semibold text-gray-900">
              {formatDisplayDate(credits.periodStart)} – {formatDisplayDate(credits.periodEnd)}
            </dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Coins className="h-3.5 w-3.5" />
              {t("credits.profile.balance")}
            </dt>
            <dd className="mt-1 font-semibold text-gray-900">
              {t("credits.profile.balanceValue", { available: credits.available, total: credits.total })}
            </dd>
          </div>
        </dl>

        {subscription && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 font-medium text-gray-800">
              <input
                type="checkbox"
                role="switch"
                checked={subscription.auto_renew}
                onChange={toggleAutoRenew}
                disabled={busy}
                className="h-4 w-4 accent-orange-500"
              />
              {t("credits.profile.autoRenew")}
            </label>
            <AutoRenewTooltip />
          </div>
        )}
        {credits.nextSubscription && (
          <p className="mt-3 text-sm text-gray-600">
            {t("credits.profile.nextMonth", {
              month: formatCreditMonth(credits.nextSubscription.period_month, monthNames),
              plan: credits.nextSubscription.plan_name,
            })}
          </p>
        )}

        {credits.pendingRequests.length > 0 && (
          <ul className="mt-4 space-y-2">
            {credits.pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-amber-900">
                  {t("credits.profile.pendingRequest", {
                    what: requestLabel(request),
                    month: formatCreditMonth(request.period_month, monthNames),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => requestWithdraw(request)}
                  disabled={busy}
                  className="w-fit cursor-pointer rounded-lg px-3 py-1.5 font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60"
                >
                  {t("credits.profile.withdraw")}
                </button>
              </li>
            ))}
          </ul>
        )}

        {subscription && planCollapsible && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              {subscription.auto_renew
                ? t("credits.profile.renewsOn", {
                    plan: subscription.plan_name,
                    date: formatDisplayDate(nextCreditMonth(credits.periodStart)),
                  })
                : t("credits.profile.endsOn", { date: formatDisplayDate(credits.periodEnd) })}
            </p>
            <ToggleButton
              open={planOpen}
              controls={PLAN_OPTIONS}
              onClick={() => setPlanOpen(!planOpen)}
              prominent={!subscription.auto_renew}
            >
              {t(subscription.auto_renew ? "credits.profile.changePlanNext" : "credits.profile.choosePlanNext")}
            </ToggleButton>
          </div>
        )}

        {(!planCollapsible || planOpen) && (
          <h3 className="mt-6 text-sm font-semibold text-gray-900">
            {t(period === "current" ? "credits.profile.choosePlan" : "credits.profile.changePlan", {
              month: formatCreditMonth(requestMonth, monthNames),
            })}
          </h3>
        )}
        {showPlans ? (
          <div id={PLAN_OPTIONS} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="flex flex-col rounded-xl border border-gray-200 p-4">
                <p className="font-semibold text-gray-900">{plan.name}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{plan.credits_per_period}</p>
                <p className="text-xs text-gray-500">{t("credits.profile.creditsPerMonth")}</p>
                <p className="mt-2 text-sm font-semibold text-green-600">{t("credits.profile.price", { price: plan.price })}</p>
                <button
                  type="button"
                  onClick={() => setSelectedPlan(plan)}
                  className="mt-3 cursor-pointer rounded-lg border border-orange-200 bg-orange-50 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
                >
                  {t("credits.profile.choose")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          !canChoosePlan && (
            <p className="mt-2 text-sm text-gray-500">
              {t(pendingSubscription ? "credits.profile.planPending" : "credits.profile.planDecided")}
            </p>
          )
        )}
      </section>

      <section id={TOPUP_SECTION} className={`${cardStyle} scroll-mt-6`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <PlusCircle className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t("credits.profile.topupTitle")}</h2>
            <p className="text-sm text-gray-500">{t("credits.profile.topupSubtitle")}</p>
          </div>
        </div>
        {!credits.hasActiveSubscription ? (
          <p className="mt-4 text-sm text-gray-600">{t("credits.profile.topupNeedsSubscription")}</p>
        ) : pendingTopup ? (
          <p className="mt-4 text-sm text-gray-600">{t("credits.profile.topupPending")}</p>
        ) : (
          <div className="mt-4">
            <ToggleButton open={showTopups} controls={TOPUP_OPTIONS} onClick={() => setTopupOpen(!showTopups)}>
              {t("credits.profile.buyTopup")}
            </ToggleButton>
          </div>
        )}
        {credits.hasActiveSubscription && !pendingTopup && showTopups && (
          <div id={TOPUP_OPTIONS} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {packages.map((topup) => (
              <button
                key={topup.id}
                type="button"
                onClick={() => setSelectedTopup(topup)}
                className="flex cursor-pointer flex-col items-start rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/50 disabled:opacity-60"
              >
                <span className="text-lg font-bold text-gray-900">
                  +{t("credits.profile.creditsCount", { count: topup.credits })}
                </span>
                <span className="mt-2 text-sm font-semibold text-green-600">{t("credits.profile.price", { price: topup.price })}</span>
              </button>
            ))}
          </div>
        )}

        {requests.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold text-gray-900">{t("credits.profile.requestsTitle")}</h3>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {requests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-gray-700">
                    {requestLabel(request)} · {formatCreditMonth(request.period_month, monthNames)}
                    {request.source === "AUTO_RENEW" && (
                      <span className="ml-1 text-xs text-gray-400">({t("credits.profile.autoRenewSource")})</span>
                    )}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CREDIT_REQUEST_STATUS_STYLES[request.status]}`}>
                    {requestStatuses[request.status] || request.status}
                  </span>
                </li>
              ))}
            </ul>
            {requests.length < requestsTotal && (
              <div className="mt-3">
                <LoadMore
                  shown={requests.length}
                  total={requestsTotal}
                  fetching={requestsFetching}
                  onLoadMore={loadMoreRequests}
                />
              </div>
            )}
          </>
        )}
      </section>

      {selectedPlan && (
        <SubscribeModal
          plan={selectedPlan}
          role={role}
          period={period}
          month={requestMonth}
          monthStarted={new Date().getDate() > 1}
          onClose={() => setSelectedPlan(null)}
          onSent={async () => {
            setSelectedPlan(null);
            setPlanOpen(false);
            await reload();
          }}
        />
      )}
      {selectedTopup && (
        <TopupModal
          topup={selectedTopup}
          role={role}
          periodEnd={credits.periodEnd}
          onClose={() => setSelectedTopup(null)}
          onSent={async () => {
            setSelectedTopup(null);
            setTopupOpen(false);
            await reload();
          }}
        />
      )}
      {withdrawingRenewal && (
        <ConfirmModal
          variant="danger"
          title={t("credits.renewalConfirm.withdrawTitle")}
          message={t("credits.renewalConfirm.withdrawText", {
            plan: withdrawingRenewal.plan_name ?? "",
            month: formatCreditMonth(withdrawingRenewal.period_month, monthNames),
          })}
          confirmLabel={t("credits.renewalConfirm.withdrawButton")}
          busy={busy}
          onConfirm={() => withdraw(withdrawingRenewal)}
          onClose={() => setWithdrawingRenewal(null)}
        />
      )}
    </>
  );
}

export default SubscriptionSection;
