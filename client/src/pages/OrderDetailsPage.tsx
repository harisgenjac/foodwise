import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarX, Check, PackageCheck, SearchX } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import { useLiveOrderRefresh } from "../context/LiveEventsContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import OrderDecisionModal from "../components/order/OrderDecisionModal.js";
import OrderDetailsView from "../components/order/OrderDetailsView.js";
import RestaurantOrderView from "../components/orderPage/RestaurantOrderView.js";
import MockCourierPanel from "../components/order/MockCourierPanel.js";
import { DEV_TOOLS } from "../utils/devTools.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
import { deliveryFailedBeforePickup, formatOrderCode } from "../utils/orders.js";
import type { OrderDetails } from "../types/index.js";

// One order for its store or its restaurant. The restaurant sees its own page (RestaurantOrderView,
// design/order-details/); the store sees OrderDetailsView (the items with its changes, the totals,
// the changes made at sending, the restaurant, its actions and the history).
function OrderDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const isStore = user?.role === "STORE";

  const fetchOrder = useCallback(async () => {
    try {
      const response = await api.get(`/orders/${id}`);
      setOrder(response.data.order);
    } catch (err) {
      console.error("Error fetching order:", err);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const pickupActions = usePickupActions(fetchOrder);

  // The other side's decision, the courier's progress: the order is loaded again when it changes.
  useLiveOrderRefresh(fetchOrder, Number(id));

  const listPath = isStore ? "/orders" : "/my-orders";
  const section = { label: t(isStore ? "sidebar.orders" : "sidebar.myOrders"), to: listPath };
  // The restaurant's page is laid out as its design (1040 px, the new pages' font).
  const frame = isStore ? "mx-auto max-w-5xl space-y-6 pb-10" : "mx-auto flex max-w-[1040px] flex-col gap-5 pb-10 font-jakarta text-neutral-900";

  if (loading) {
    return (
      <div className={frame}>
        <Breadcrumbs items={[section]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!order) {
    return (
      <div className={frame}>
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={SearchX}
          title={t("orders.notFoundTitle")}
          subtitle={t("orders.notFoundSubtitle")}
          action={{ to: listPath, label: t("orders.backToList") }}
        />
      </div>
    );
  }

  const code = formatOrderCode(order.code);
  const isPending = order.status === "Pending";
  // A delivery order is completed by the courier's pickup, never by the store.
  const canHandOver = order.status === "Confirmed" && order.fulfilment_method === "PICKUP";
  const deliveryFailed = deliveryFailedBeforePickup(order);
  const handOver = { ...order, business_name: order.restaurant.business_name ?? "" };

  // Development tools only (DEV_TOOLS): the mock provider's courier, above everything.
  const mockCourier = DEV_TOOLS && order.fulfilment_method === "DELIVERY" && order.delivery && (
    <MockCourierPanel orderId={order.id} delivery={order.delivery} onDone={fetchOrder} />
  );

  if (!isStore) {
    return (
      <div className={frame}>
        <Breadcrumbs items={[section, { label: code }]} />
        {mockCourier}
        <RestaurantOrderView order={order} onChanged={fetchOrder} />
      </div>
    );
  }

  return (
    <div className={frame}>
      <Breadcrumbs items={[section, { label: code }]} />
      {mockCourier}

      <OrderDetailsView
        order={order}
        viewer="STORE"
        actions={
          <>
            {isPending && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setDeciding(true)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-800 py-2.5 font-semibold text-white shadow-sm shadow-brand-800/20 transition-colors hover:bg-brand-900"
                >
                  <Check className="h-4 w-4" />
                  {t("orders.decideButton")}
                </button>
              </div>
            )}
            {deliveryFailed && (
              <p data-testid="delivery-failed" className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
                {t("orders.deliveryFailed.storeWaiting")}
              </p>
            )}
            {canHandOver && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => pickupActions.request("complete", handOver)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-800 py-2.5 font-semibold text-white shadow-sm shadow-brand-800/20 transition-colors hover:bg-brand-900"
                >
                  <PackageCheck className="h-4 w-4" />
                  {t("pickups.completeButton")}
                </button>
                {order.is_overdue && (
                  <button
                    type="button"
                    onClick={() => pickupActions.request("cancel-overdue", handOver)}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-danger-200 py-2.5 font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                  >
                    <CalendarX className="h-4 w-4" />
                    {t("pickups.cancelOverdueButton")}
                  </button>
                )}
              </div>
            )}
          </>
        }
      />

      {pickupActions.pending && (
        <PickupConfirmModal
          {...pickupActions.pending}
          busy={pickupActions.busy}
          onClose={pickupActions.close}
          onConfirm={pickupActions.confirm}
        />
      )}

      {deciding && (
        <OrderDecisionModal
          order={order}
          restaurant={order.restaurant.business_name ?? ""}
          onClose={() => setDeciding(false)}
          onDecided={fetchOrder}
          {...(user?.preparation_minutes && { preparationMinutes: user.preparation_minutes })}
        />
      )}

    </div>
  );
}

export default OrderDetailsPage;
