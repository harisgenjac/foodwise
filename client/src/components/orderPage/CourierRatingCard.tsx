import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import { PAGE_CARD } from "./styles.js";
import type { CourierRating, OrderDetails } from "../../types/index.js";

// The server's limit on the comment.
const MAX_COMMENT = 500;
const STARS = [1, 2, 3, 4, 5];

// The card shows for a delivered order whose courier the restaurant can still rate, and, once
// rated, until the 7 days to rate are over (courier_rating_until).
export const showCourierRating = (order: OrderDetails, now: number) => {
  const delivered = order.fulfilment_method === "DELIVERY" && order.delivery?.status === "DELIVERED";
  if (!delivered) return false;
  if (order.can_rate_courier) return true;
  return Boolean(order.courier_rating && order.courier_rating_until && new Date(order.courier_rating_until).getTime() > now);
};

interface CourierRatingCardProps {
  order: OrderDetails;
  // The rating was saved (the page loads the order again).
  onRated: () => void;
}

// "Kako je prošla dostava?" (design/order-details/order-details-delivered.html): five star buttons
// (a group, each aria-pressed), an optional comment and "Pošalji ocjenu" (enabled once a star is
// chosen; POST /orders/:id/courier-rating). Once sent, or for an order already rated, the card
// thanks the restaurant and the stars are locked on the given rating.
function CourierRatingCard({ order, onRated }: CourierRatingCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const courierLabelId = useId();
  const commentId = useId();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<CourierRating | null>(null);

  const given = sent ?? order.courier_rating ?? null;
  const locked = given !== null;
  const value = given?.rating ?? rating;
  const name = given?.courier_name ?? order.delivery?.courier_name ?? t("orderPage.contact.courier");

  const send = async () => {
    if (!rating || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.post(`/orders/${order.id}/courier-rating`, { rating, comment: comment.trim() || null });
      setSent(response.data.rating as CourierRating);
      onRated();
    } catch (err) {
      console.error(err);
      setError(apiErrorMessage(err) || t("orderPage.rating.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      data-testid="courier-rating"
      data-locked={locked}
      className={`${PAGE_CARD} flex flex-col gap-4 px-5 py-[22px] sm:px-6`}
    >
      <div>
        <h2 id={titleId} className="text-lg font-extrabold text-neutral-900">
          {locked ? t("orderPage.rating.thanksTitle") : t("orderPage.rating.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-600" role={sent ? "status" : undefined}>
          {locked ? t("orderPage.rating.thanksText") : t("orderPage.rating.text", { name })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={courierLabelId} className="text-sm font-bold text-neutral-900">
          {t("orderPage.rating.courier", { name })}
        </span>
        <div role="group" aria-label={t("orderPage.rating.group")} aria-describedby={courierLabelId} className="flex gap-1">
          {STARS.map((star) => {
            const filled = star <= value;
            return (
              <button
                key={star}
                type="button"
                aria-label={t("orderPage.rating.star", { value: star })}
                aria-pressed={star === value}
                disabled={locked}
                onClick={() => setRating(star)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors enabled:hover:bg-warning-100 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-default"
              >
                <Star
                  aria-hidden="true"
                  data-filled={filled}
                  className={`h-7 w-7 ${filled ? "fill-warning-400 text-warning-500" : "fill-none text-neutral-400"}`}
                  strokeWidth={1.8}
                />
              </button>
            );
          })}
        </div>
      </div>

      {locked ? (
        given.comment && (
          <p data-testid="rating-comment" className="text-sm text-neutral-700">
            {t("orderPage.rating.yourComment", { comment: given.comment })}
          </p>
        )
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
            <label htmlFor={commentId} className="text-sm font-semibold text-neutral-900">
              {t("orderPage.rating.comment")}
            </label>
            <input
              id={commentId}
              type="text"
              maxLength={MAX_COMMENT}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t("orderPage.rating.placeholder")}
              className="h-12 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-800 focus:shadow-[0_0_0_3px_var(--color-brand-100)]"
            />
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!rating || busy}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-brand-800 px-[22px] text-[15px] font-extrabold text-white transition-colors hover:bg-brand-900 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {t("orderPage.rating.send")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm font-semibold text-danger-700">
          {error}
        </p>
      )}
    </section>
  );
}

export default CourierRatingCard;
