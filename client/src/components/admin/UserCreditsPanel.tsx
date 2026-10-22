import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Coins, SlidersHorizontal } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import Pagination from "./Pagination.js";
import { inputStyle } from "../form/FormField.js";
import { formatDateTime } from "../../utils/admin.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { formatCreditMonth } from "../../utils/credits.js";
import type { CreditSubscription, CreditTransaction } from "../../types/index.js";

const LEDGER_PAGE_SIZE = 10;
const MAX_REASON_LENGTH = 500;

interface Balance {
  periodStart: string;
  periodEnd: string;
  subscription: CreditSubscription | null;
  total: number;
  used: number;
  available: number;
}

// The admin's user page for stores and restaurants: this month's balance, a manual +/−
// adjustment with a required reason, and the user's credit ledger.
function UserCreditsPanel({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const types = t("admin.userCredits.types", { returnObjects: true }) as Record<string, string>;
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

  useEffect(() => {
    load();
  }, [load]);

  const adjust = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/credits/users/${userId}/adjust`, { amount: Number(amount), reason });
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
          onClick={() => {
            setAmount("");
            setReason("");
            setAdjusting(true);
          }}
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

      {adjusting && (
        <Modal onClose={() => setAdjusting(false)}>
          <h3 className="text-lg font-bold text-gray-900">{t("admin.userCredits.adjustTitle")}</h3>
          <p className="mt-2 text-sm text-gray-600">{t("admin.userCredits.adjustText")}</p>
          <label className="mt-4 block text-sm font-medium text-gray-700">
            {t("admin.userCredits.amount")}
            <input
              type="number"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="+5 / -2"
              className={`${inputStyle} mt-1.5`}
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-gray-700">
            {t("admin.common.reasonLabel")}
            <textarea
              rows={3}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputStyle} mt-1.5 resize-none`}
            />
          </label>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setAdjusting(false)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("admin.common.cancel")}
            </button>
            <button
              type="button"
              onClick={adjust}
              disabled={busy || !amount || !reason.trim()}
              className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("admin.userCredits.save")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export default UserCreditsPanel;
