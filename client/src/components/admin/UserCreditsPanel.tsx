import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Coins, Inbox, SlidersHorizontal } from "lucide-react";
import api from "../../api/axios.js";
import Pagination from "./Pagination.js";
import CreditRequestDecisionModal, { CreditRequestDecisionButtons, type CreditRequestAction } from "./CreditRequestDecisionModal.js";
import AdjustCreditsModal from "./AdjustCreditsModal.js";
import { formatDateTime } from "../../utils/admin.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { describeCreditRequest, formatCreditMonth } from "../../utils/credits.js";
import type { AdminCreditRequest, CreditSubscription, CreditTransaction } from "../../types/index.js";

const LEDGER_PAGE_SIZE = 10;

interface Balance {
  periodStart: string;
  periodEnd: string;
  subscription: CreditSubscription | null;
  total: number;
  used: number;
  available: number;
}

// The admin's user page for stores and restaurants: this month's balance, the user's pending
// credit requests to approve or reject, a manual +/− adjustment with a required reason, and
// the user's credit ledger.
function UserCreditsPanel({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<AdminCreditRequest[]>([]);
  const [decision, setDecision] = useState<{ request: AdminCreditRequest; action: CreditRequestAction } | null>(null);
  const types = t("admin.userCredits.types", { returnObjects: true }) as Record<string, string>;
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;
  const categories = t("categories", { returnObjects: true }) as Record<string, string>;
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/admin/credits/users/${userId}/ledger`, {
        params: { limit: LEDGER_PAGE_SIZE, offset },
      });
      setBalance(response.data.balance);
      setTransactions(response.data.transactions);
      setTotal(response.data.total);
    } catch (err) {
      console.error("Error loading the credit ledger:", err);
    }
  }, [userId, offset]);

  const loadPending = useCallback(async () => {
    try {
      const response = await api.get("/admin/credits/requests", { params: { user_id: userId, status: "PENDING" } });
      setPending(response.data.requests);
    } catch (err) {
      console.error("Error loading pending credit requests:", err);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // An approval adds a plan or credits, so the balance and the ledger change too.
  const afterDecision = () => {
    loadPending();
    setOffset(0);
    load();
  };

  const adjust = async (amount: number, reason: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/credits/users/${userId}/adjust`, { amount, reason });
      toast.success(t("admin.userCredits.adjusted"));
      setAdjusting(false);
      setOffset(0);
      await load();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  if (!balance) return null;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Coins className="h-4 w-4 text-orange-600" />
          {t("admin.userCredits.title")}
        </h2>
        <button
          type="button"
          onClick={() => setAdjusting(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("admin.userCredits.adjust")}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [t("admin.userCredits.plan"), balance.subscription?.plan_name ?? t("admin.credits.noPlan")],
          [t("credits.page.period"), `${formatDisplayDate(balance.periodStart)} – ${formatDisplayDate(balance.periodEnd)}`],
          [t("credits.page.used"), `${balance.used} / ${balance.total}`],
          [t("credits.page.available"), String(balance.available)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-gray-50 p-3">
            <dt className="text-xs font-medium text-gray-500">{label}</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>

      {pending.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <Inbox className="h-4 w-4" />
            {t("admin.userCredits.pendingTitle")}
          </h3>
          <ul className="mt-2 divide-y divide-amber-100">
            {pending.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {requestTypes[request.request_type]} · {describeCreditRequest(request, t)} · {request.price} KM
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatCreditMonth(request.period_month, monthNames)} · {formatDateTime(request.created_at)}
                  </p>
                  {(request.auto_renew || request.source === "AUTO_RENEW") && (
                    <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {t(request.source === "AUTO_RENEW" ? "admin.creditRequests.renewal" : "admin.creditRequests.autoRenew")}
                    </span>
                  )}
                </div>
                <CreditRequestDecisionButtons onDecide={(action) => setDecision({ request, action })} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-900">{t("admin.userCredits.ledgerTitle")}</h3>
      {transactions.length === 0 ? (
        <p className="text-sm text-gray-500">{t("admin.userCredits.empty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-2 pr-3">{t("admin.userCredits.columnDate")}</th>
                  <th className="py-2 pr-3">{t("admin.userCredits.columnType")}</th>
                  <th className="py-2 pr-3 text-right">{t("admin.userCredits.columnAmount")}</th>
                  <th className="hidden py-2 pr-3 md:table-cell">{t("admin.userCredits.columnMonth")}</th>
                  <th className="hidden py-2 md:table-cell">{t("admin.userCredits.columnDetails")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatDateTime(transaction.created_at)}</td>
                    <td className="py-2 pr-3 text-gray-800">{types[transaction.type] || transaction.type}</td>
                    <td
                      className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                        transaction.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount}
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-3 text-gray-600 md:table-cell">
                      {formatCreditMonth(transaction.period_month, monthNames)}
                    </td>
                    <td className="hidden py-2 text-gray-500 md:table-cell">
                      {[
                        transaction.reason,
                        transaction.category && (categories[transaction.category] || transaction.category),
                        transaction.related_entity_id &&
                          transaction.related_entity_type !== "credit_request" &&
                          `#${transaction.related_entity_id}`,
                        transaction.created_by_email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total} limit={LEDGER_PAGE_SIZE} offset={offset} onChange={setOffset} />
        </>
      )}

      {adjusting && <AdjustCreditsModal busy={busy} onConfirm={adjust} onClose={() => setAdjusting(false)} />}

      {decision && (
        <CreditRequestDecisionModal
          request={decision.request}
          action={decision.action}
          onClose={() => setDecision(null)}
          onDone={afterDecision}
        />
      )}
    </section>
  );
}

export default UserCreditsPanel;
