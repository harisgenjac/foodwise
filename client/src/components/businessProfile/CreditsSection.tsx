import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarRange, Coins, Info, Layers, PlusCircle, Repeat, Wallet, X } from "lucide-react";
import api from "../../api/axios.js";
import { useCredits } from "../../context/CreditsContext.js";
import AutoRenewTooltip from "../credits/AutoRenewTooltip.js";
import ConfirmModal from "../common/ConfirmModal.js";
import LoadMore from "../LoadMore.js";
import { usePagedLimit } from "../../hooks/usePagedLimit.js";
import { LIST_PAGE_SIZE } from "../../utils/pagination.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { formatCreditMonth, nextCreditMonth, usageBarColor, usagePercent } from "../../utils/credits.js";
import { Chip, HintTip, SectionError, Switch } from "./ui.js";
import type { CreditRequest, CreditRequestStatus, Plan, TopupPackage } from "../../types/index.js";
import type { CreditDraft } from "./draft.js";

const STATUS_TONE: Record<CreditRequestStatus, "success" | "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  COMPANY_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  COMPANY_REJECTED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

const tile = "rounded-2xl border border-neutral-100 bg-neutral-50 p-4";
const outlineButton =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-brand-800 hover:bg-brand-50";

interface CreditsSectionProps {
  value: CreditDraft;
  onChange: (value: CreditDraft) => void;
  error?: string | undefined;
  // Bumped after a save, so the requests are loaded again.
  reloadKey: number;
}

// "Pretplata i krediti" (stores). An independent store sees its plan, period and balance,
// auto-renew, the plan change for next month, extra credits and its requests; without a plan this
// month, the plans to request one. A branch sees only its balance (its headquarters runs its plan)
// and can still ask its headquarters for extra credits. Every choice here (auto-renew, a plan, a
// top-up, withdrawing a request) is only sent when the page is saved.
function CreditsSection({ value, onChange, error, reloadKey }: CreditsSectionProps) {
  const { t } = useTranslation();
  const { credits } = useCredits();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [requestsFetching, setRequestsFetching] = useState(false);
  const { limit, loadMore } = usePagedLimit(LIST_PAGE_SIZE);
  const [plansOpen, setPlansOpen] = useState(false);
  const [topupsOpen, setTopupsOpen] = useState(false);
  // Withdrawing an automatic renewal drops it for good, so marking it asks first.
  const [confirmRenewal, setConfirmRenewal] = useState<CreditRequest | null>(null);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;
  const requestStatuses = t("credits.requestStatuses", { returnObjects: true }) as Record<string, string>;

  const loadRequests = useCallback(async () => {
    setRequestsFetching(true);
    try {
      const response = await api.get("/credits/requests", { params: { limit } });
      setRequests(response.data.requests);
      setRequestsTotal(response.data.total);
    } catch (err) {
      console.error("Error loading credit requests:", err);
    } finally {
      setRequestsFetching(false);
    }
  }, [limit]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests, reloadKey]);

  useEffect(() => {
    Promise.all([api.get("/credits/plans"), api.get("/credits/topup-packages")])
      .then(([planResponse, packageResponse]) => {
        setPlans(planResponse.data.plans);
        setPackages(packageResponse.data.packages);
      })
      .catch((err) => console.error("Error loading plans:", err));
  }, []);

  if (!credits) return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-neutral-100" />;

  const subscription = credits.subscription;
  const managed = credits.managedByCompany;
  const company = credits.companyName ?? "";
  const period = subscription ? "next" : "current";
  const requestMonth = period === "current" ? credits.periodStart : nextCreditMonth(credits.periodStart);
  const pendingSubscription = credits.pendingRequests.find(
    (request) => request.request_type === "SUBSCRIPTION" && request.period_month === requestMonth,
  );
  const pendingTopup = credits.pendingRequests.find((request) => request.request_type === "TOPUP");
  const canChoosePlan = !managed && !pendingSubscription && !(period === "next" && credits.nextSubscription);
  const canTopup = credits.hasActiveSubscription && !pendingTopup;
  const canWithdraw = (request: CreditRequest) =>
    managed ? request.status === "COMPANY_REVIEW" : request.status === "PENDING";
  const percent = usagePercent(credits.used, credits.total);

  const requestLabel = (request: CreditRequest) =>
    request.request_type === "SUBSCRIPTION"
      ? `${requestTypes.SUBSCRIPTION} ${request.plan_name ?? ""} · ${t("credits.profile.planCredits", { count: request.credits })}`
      : `${requestTypes.TOPUP} · +${t("credits.profile.creditsCount", { count: request.credits })}`;

  const toggleWithdraw = (request: CreditRequest) => {
    const marked = value.withdraw.includes(request.id);
    if (!marked && request.source === "AUTO_RENEW") {
      setConfirmRenewal(request);
      return;
    }
    onChange({
      ...value,
      withdraw: marked ? value.withdraw.filter((id) => id !== request.id) : [...value.withdraw, request.id],
    });
  };

  const choosePlan = (plan: Plan) => {
    onChange({ ...value, plan });
    setPlansOpen(false);
  };

  const planList = (
    <div id="plan-options" className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="plan-options">
      {plans.map((plan) => {
        const chosen = value.plan?.id === plan.id;
        return (
          <button
            key={plan.id}
            type="button"
            aria-pressed={chosen}
            onClick={() => choosePlan(plan)}
            className={`flex cursor-pointer flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
              chosen ? "border-brand-800 bg-brand-50" : "border-neutral-200 bg-white hover:border-brand-300"
            }`}
          >
            <span className="font-bold text-neutral-900">{plan.name}</span>
            <span className="mt-1 text-2xl font-extrabold text-neutral-900">{plan.credits_per_period}</span>
            <span className="text-xs text-neutral-600">{t("credits.profile.creditsPerMonth")}</span>
            <span className="mt-2 text-sm font-bold text-accent-700">{t("credits.profile.price", { price: plan.price })}</span>
          </button>
        );
      })}
    </div>
  );

  const chosenNote = (text: string, clear: () => void, testId: string) => (
    <p data-testid={testId} className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
      {text}
      <button
        type="button"
        onClick={clear}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 font-semibold text-brand-800 hover:bg-brand-100 sm:min-h-0 sm:py-1"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        {t("profile.credits.cancelChoice")}
      </button>
    </p>
  );

  return (
    <div className="space-y-5" data-testid="credits-section">
      <SectionError message={error} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-neutral-600">
          <Info className="h-4 w-4 shrink-0 text-brand-800" aria-hidden="true" />
          {managed ? t("profile.credits.companyManages", { company }) : t("profile.credits.paymentNote")}
        </p>
        <Link to="/credits" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brand-800 hover:text-brand-900">
          {t("credits.profile.viewCredits")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {subscription || managed ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={tile}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {t("credits.profile.currentPlan")}
            </dt>
            <dd className="mt-1 text-lg font-extrabold text-neutral-900">
              {subscription ? subscription.plan_name : t("credits.profile.noPlan")}
            </dd>
          </div>
          <div className={tile}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              {t("credits.profile.period")}
            </dt>
            <dd className="mt-1 text-lg font-extrabold text-neutral-900">
              {formatDisplayDate(credits.periodStart)} – {formatDisplayDate(credits.periodEnd)}
            </dd>
          </div>
          <div className={tile}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              {t("credits.profile.balance")}
            </dt>
            <dd className="mt-1">
              <span className="text-lg font-extrabold text-neutral-900">{credits.available}</span>{" "}
              <span className="text-sm text-neutral-600">{t("profile.credits.ofTotal", { total: credits.total })}</span>
              <span
                role="progressbar"
                aria-label={t("profile.credits.usage")}
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 block h-2 overflow-hidden rounded-full bg-neutral-200"
              >
                <span data-testid="credits-usage-bar" className={`block h-full rounded-full ${usageBarColor(percent)}`} style={{ width: `${percent}%` }} />
              </span>
            </dd>
          </div>
        </dl>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-neutral-900">
            {t("credits.profile.choosePlan", { month: formatCreditMonth(requestMonth, monthNames) })}
          </h3>
          {canChoosePlan ? planList : <p className="text-sm text-neutral-600">{t("credits.profile.planPending")}</p>}
        </div>
      )}

      {subscription && !managed && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-900">{t("credits.profile.autoRenew")}</span>
            <AutoRenewTooltip />
            <Switch
              checked={value.autoRenew ?? subscription.auto_renew}
              onChange={(autoRenew) => onChange({ ...value, autoRenew })}
              label={t("credits.profile.autoRenew")}
              testId="auto-renew-switch"
            />
          </div>
          {canChoosePlan ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPlansOpen(!plansOpen)}
                aria-expanded={plansOpen}
                aria-controls="plan-options"
                className={outlineButton}
              >
                <Repeat className="h-4 w-4" aria-hidden="true" />
                {t("profile.credits.changePlan")}
              </button>
              <HintTip label={t("profile.credits.changePlanInfo")} text={t("profile.credits.changePlanTip")} />
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              {t(pendingSubscription ? "credits.profile.planPending" : "credits.profile.planDecided")}
            </p>
          )}
        </div>
      )}
      {subscription && !managed && plansOpen && planList}
      {credits.nextSubscription && (
        <p className="text-sm text-neutral-600">
          {t("credits.profile.nextMonth", {
            month: formatCreditMonth(credits.nextSubscription.period_month, monthNames),
            plan: credits.nextSubscription.plan_name,
          })}
        </p>
      )}
      {value.plan &&
        chosenNote(
          t("profile.credits.chosenPlan", { plan: value.plan.name, month: formatCreditMonth(requestMonth, monthNames) }),
          () => onChange({ ...value, plan: null }),
          "chosen-plan",
        )}

      <div id="topup" className="scroll-mt-6 border-t border-neutral-100 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-neutral-900">
              {t(managed ? "credits.profile.topupTitleCompany" : "profile.credits.extra")}
            </p>
            <p className="text-sm text-neutral-600">
              {managed ? t("credits.profile.topupSubtitleCompany", { company }) : t("profile.credits.extraText")}
            </p>
          </div>
          {canTopup && !value.topup && (
            <button
              type="button"
              onClick={() => setTopupsOpen(!topupsOpen)}
              aria-expanded={topupsOpen}
              aria-controls="topup-options"
              className={outlineButton}
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              {t(managed ? "credits.profile.requestTopupFromCompany" : "credits.profile.buyTopup")}
            </button>
          )}
        </div>
        {!credits.hasActiveSubscription ? (
          <p className="mt-3 text-sm text-neutral-600">
            {managed ? t("credits.profile.topupNeedsCompanyPlan", { company }) : t("credits.profile.topupNeedsSubscription")}
          </p>
        ) : (
          pendingTopup && (
            <p className="mt-3 text-sm text-neutral-600">
              {pendingTopup.status === "COMPANY_REVIEW"
                ? t("credits.profile.topupPendingAtCompany", { company })
                : t("credits.profile.topupPending")}
            </p>
          )
        )}
        {canTopup && topupsOpen && !value.topup && (
          <div id="topup-options" data-testid="topup-options" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {packages.map((topup) => (
              <button
                key={topup.id}
                type="button"
                onClick={() => {
                  onChange({ ...value, topup });
                  setTopupsOpen(false);
                }}
                className="flex cursor-pointer flex-col items-start rounded-2xl border border-neutral-200 bg-white p-4 text-left hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="text-lg font-extrabold text-neutral-900">
                  +{t("credits.profile.creditsCount", { count: topup.credits })}
                </span>
                <span className="mt-1 text-sm font-bold text-accent-700">{t("credits.profile.price", { price: topup.price })}</span>
              </button>
            ))}
          </div>
        )}
        {value.topup && (
          <div className="mt-3">
            {chosenNote(
              t(managed ? "profile.credits.chosenTopupCompany" : "profile.credits.chosenTopup", {
                count: value.topup.credits,
                company,
              }),
              () => onChange({ ...value, topup: null }),
              "chosen-topup",
            )}
          </div>
        )}
      </div>

      {requests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold tracking-wide text-neutral-700 uppercase">{t("credits.profile.requestsTitle")}</h3>
          <ul className="mt-2 divide-y divide-neutral-100 text-sm" data-testid="credit-requests">
            {requests.map((request) => {
              const marked = value.withdraw.includes(request.id);
              return (
                <li key={request.id} data-testid="credit-request" className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={`text-neutral-800 ${marked ? "line-through" : ""}`}>
                    {requestLabel(request)} · {formatCreditMonth(request.period_month, monthNames)}
                    {request.source === "AUTO_RENEW" && (
                      <span className="ml-1 text-xs text-neutral-600">({t("credits.profile.autoRenewSource")})</span>
                    )}
                    {managed && request.source === "COMPANY" && (
                      <span className="ml-1 text-xs text-neutral-600">({t("credits.profile.companySource", { company })})</span>
                    )}
                    {request.company_note && (
                      <span className="block text-xs text-neutral-600 italic">
                        {t("credits.profile.companyNote", { note: request.company_note })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {canWithdraw(request) && (
                      <button
                        type="button"
                        onClick={() => toggleWithdraw(request)}
                        className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-xs font-bold text-danger-700 hover:bg-danger-50 sm:min-h-0 sm:py-1"
                      >
                        {marked ? t("profile.credits.keepRequest") : t("profile.credits.withdraw")}
                      </button>
                    )}
                    {marked ? (
                      <Chip tone="neutral">{t("profile.credits.willWithdraw")}</Chip>
                    ) : (
                      <Chip tone={STATUS_TONE[request.status]}>{requestStatuses[request.status] ?? request.status}</Chip>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {requests.length < requestsTotal && (
            <div className="mt-3">
              <LoadMore shown={requests.length} total={requestsTotal} fetching={requestsFetching} onLoadMore={loadMore} />
            </div>
          )}
        </div>
      )}

      {confirmRenewal && (
        <ConfirmModal
          variant="danger"
          icon={Wallet}
          title={t("credits.renewalConfirm.withdrawTitle")}
          message={t("credits.renewalConfirm.withdrawText", {
            plan: confirmRenewal.plan_name ?? "",
            month: formatCreditMonth(confirmRenewal.period_month, monthNames),
          })}
          confirmLabel={t("credits.renewalConfirm.withdrawButton")}
          busy={false}
          onConfirm={() => {
            onChange({ ...value, withdraw: [...value.withdraw, confirmRenewal.id] });
            setConfirmRenewal(null);
          }}
          onClose={() => setConfirmRenewal(null)}
        />
      )}
    </div>
  );
}

export default CreditsSection;
