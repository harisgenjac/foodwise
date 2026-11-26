import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import OrderHero from "./OrderHero.js";
import OrderSummaryCards from "./OrderSummaryCards.js";
import OrderItemsCard from "./OrderItemsCard.js";
import OrderContactCard from "./OrderContactCard.js";
import OrderDetailsAccordion from "./OrderDetailsAccordion.js";
import ReportProblemDialog from "./ReportProblemDialog.js";
import CourierRatingCard, { showCourierRating } from "./CourierRatingCard.js";
import DeliveryFailedActions from "../order/DeliveryFailedActions.js";
import { useCancelOrder } from "../../hooks/useCancelOrder.js";
import { deliveryFailedBeforePickup } from "../../utils/orders.js";
import { buildOrderSteps } from "../../utils/orderSteps.js";
import { listOrder, orderHeadline, useMinuteTick } from "../../utils/orderPage.js";
import { HERO_CANCEL_BUTTON } from "./styles.js";
import type { OrderDetails } from "../../types/index.js";

interface RestaurantOrderViewProps {
  order: OrderDetails;
  // Loads the order again (after an action; live updates do it in the page).
  onChanged: () => void;
}

// The restaurant's order page (design/order-details/): the hero with the status sentence, the steps
// and the actions; the three cards (when, the store, the money); the courier rating once delivered;
// the products and the contact side by side; the collapsed details, store and history. The store's
// and the admin's order pages use OrderDetailsView.
function RestaurantOrderView({ order, onChanged }: RestaurantOrderViewProps) {
  const { t, i18n } = useTranslation();
  // Every minute the countdowns move on (a live update renders at once with the new estimate).
  const now = useMinuteTick();
  const [reporting, setReporting] = useState(false);
  const cancelOrder = useCancelOrder(onChanged);
  const storeName = order.store.business_name ?? "";

  const headline = orderHeadline(order, t, now);
  const steps = buildOrderSteps(listOrder(order), t, i18n.language, order);

  let actions = null;
  if (order.status === "Pending") {
    actions = (
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => cancelOrder.request({ id: order.id, code: order.code, storeName })}
          className={`${HERO_CANCEL_BUTTON} w-full sm:w-auto`}
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
          {t("orders.cancelButton")}
        </button>
      </div>
    );
  } else if (deliveryFailedBeforePickup(order)) {
    actions = <DeliveryFailedActions order={order} onDone={onChanged} />;
  }

  return (
    <>
      <OrderHero order={order} headline={headline} steps={steps} actions={actions} />
      <OrderSummaryCards order={order} now={now} />
      {showCourierRating(order, now) && <CourierRatingCard order={order} onRated={onChanged} />}
      <div className="flex flex-wrap items-start gap-5">
        <OrderItemsCard order={order} />
        <OrderContactCard order={order} {...(order.can_report_problem && { onReport: () => setReporting(true) })} />
      </div>
      <OrderDetailsAccordion order={order} />

      {reporting && (
        <ReportProblemDialog
          order={{ id: order.id, code: order.code, fulfilment_method: order.fulfilment_method, storeName }}
          onClose={() => setReporting(false)}
          onReported={onChanged}
        />
      )}
      {cancelOrder.modal}
    </>
  );
}

export default RestaurantOrderView;
