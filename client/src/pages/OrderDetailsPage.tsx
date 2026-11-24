import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarX, Check, PackageCheck, SearchX, X } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import { useLiveOrderRefresh } from "../context/LiveEventsContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import OrderDecisionModal from "../components/order/OrderDecisionModal.js";
import OrderDetailsView from "../components/order/OrderDetailsView.js";
import DeliveryFailedActions from "../components/order/DeliveryFailedActions.js";
import MockCourierPanel from "../components/order/MockCourierPanel.js";
import { DEV_TOOLS } from "../utils/devTools.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
import { useCancelOrder } from "../hooks/useCancelOrder.js";
import { deliveryFailedBeforePickup, formatOrderCode } from "../utils/orders.js";
import type { OrderDetails } from "../types/index.js";

// One order for its store or its restaurant: the items with the store's changes, the totals, the
// changes made at sending, the other party, the actions and the history.
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

  const cancelOrder = useCancelOrder(fetchOrder);

  // The other side's decision, the courier's progress: the order is loaded again when it changes.
  useLiveOrderRefresh(fetchOrder, Number(id));

  const listPath = isStore ? "/orders" : "/my-orders";
  const section = { label: t(isStore ? "sidebar.orders" : "sidebar.myOrders"), to: listPath };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl pb-10">
        <Breadcrumbs items={[section]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-10">
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
  const canHandOver = isStore && order.status === "Confirmed" && order.fulfilment_method === "PICKUP";
  const deliveryFailed = deliveryFailedBeforePickup(order);
  const handOver = { ...order, business_name: order.restaurant.business_name ?? "" };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <Breadcrumbs items={[section, { label: code }]} />

      {/* Development tools only (DEV_TOOLS): the mock provider's courier. */}
      {DEV_TOOLS && order.fulfilment_method === "DELIVERY" && order.delivery && (
        <MockCourierPanel orderId={order.id} delivery={order.delivery} onDone={fetchOrder} />
      )}

      <OrderDetailsView
        order={order}
        viewer={isStore ? "STORE" : "RESTAURANT"}
        actions={
          <>
            {isStore && isPending && (
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
            {!isStore && isPending && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => cancelOrder.request({ id: order.id, code: order.code, storeName: order.store.business_name ?? "" })}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 font-semibold text-neutral-700 transition-colors hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700"
                >
                  <X className="h-4 w-4" />
                  {t("orders.cancelButton")}
                </button>
              </div>
            )}
            {deliveryFailed && !isStore && <DeliveryFailedActions order={order} onDone={fetchOrder} />}
            {deliveryFailed && isStore && (
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

      {cancelOrder.modal}
    </div>
  );
}

export default OrderDetailsPage;
