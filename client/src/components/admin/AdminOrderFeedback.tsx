import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageSquareWarning, Star } from "lucide-react";
import { formatDateTime } from "../../utils/admin.js";
import { PROBLEM_STATUS_STYLES } from "../../utils/problems.js";
import type { OrderDetails } from "../../types/index.js";

// On the admin's order page: the restaurant's courier rating with its comment, and its problem
// reports with their status and the reply (handled on the admin's "Prijave problema"). Nothing
// when the order has neither.
function AdminOrderFeedback({ order }: { order: OrderDetails }) {
  const { t } = useTranslation();
  const rating = order.courier_rating ?? null;
  const problems = order.problems ?? [];
  if (!rating && problems.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" data-testid="admin-order-feedback">
      {rating && (
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Star className="h-4 w-4 text-warning-600" />
            {t("admin.orderFeedback.rating")}
          </h2>
          <p className="mt-2 text-lg font-bold text-neutral-900">
            {t("admin.orderFeedback.ratingValue", { rating: rating.rating })}
            {rating.courier_name && <span className="ml-2 text-sm font-medium text-neutral-500">{rating.courier_name}</span>}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{rating.comment ?? t("admin.orderFeedback.noComment")}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {formatDateTime(rating.created_at)}
            {!rating.sent_at && ` · ${t("admin.orderFeedback.ratingNotSent")}`}
          </p>
        </div>
      )}
      {problems.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <MessageSquareWarning className="h-4 w-4 text-warning-600" />
              {t("admin.orderFeedback.problems")}
            </h2>
            <Link to="/admin/problems" className="text-sm font-medium text-brand-800 hover:underline">
              {t("admin.orderFeedback.openProblems")}
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-neutral-100">
            {problems.map((problem) => (
              <li key={problem.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900">{t(`orders.problems.reasons.${problem.reason}`)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PROBLEM_STATUS_STYLES[problem.status]}`}>
                    {t(`orders.problems.statuses.${problem.status}`)}
                  </span>
                  <span className="text-xs text-neutral-500">{formatDateTime(problem.created_at)}</span>
                </div>
                {problem.text && <p className="mt-1 whitespace-pre-line text-neutral-700">{problem.text}</p>}
                {problem.admin_reply && (
                  <p className="mt-1 text-xs italic text-neutral-500">
                    {problem.admin_reply}
                    {problem.replied_at && ` · ${t("admin.problems.replied", { time: formatDateTime(problem.replied_at) })}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default AdminOrderFeedback;
