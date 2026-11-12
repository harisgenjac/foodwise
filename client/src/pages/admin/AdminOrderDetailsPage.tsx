import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ban, SearchX } from "lucide-react";
import api from "../../api/axios.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Breadcrumbs from "../../components/Breadcrumbs.js";
import EmptyState from "../../components/product/EmptyState.js";
import OrderDetailsView from "../../components/order/OrderDetailsView.js";
import AdminCancelOrderModal, { ADMIN_CANCELLABLE } from "../../components/admin/AdminCancelOrderModal.js";
import { formatOrderCode } from "../../utils/orders.js";
import type { OrderDetails } from "../../types/index.js";

// One order for the admin: both parties, the items with the store's changes, the history, and
// cancelling it with a reason while it is open.
function AdminOrderDetailsPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const response = await api.get(`/admin/orders/${id}`);
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

  const section = { label: t("sidebar.adminOrders"), to: "/admin/orders" };

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
          action={{ to: "/admin/orders", label: t("orders.backToList") }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <Breadcrumbs items={[section, { label: formatOrderCode(order.code) }]} />

      <OrderDetailsView
        order={order}
        viewer="ADMIN"
        actions={
          ADMIN_CANCELLABLE.includes(order.status) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setCancelling(true)}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <Ban className="h-4 w-4" />
                {t("admin.orders.cancel")}
              </button>
            </div>
          )
        }
      />

      {cancelling && (
        <AdminCancelOrderModal
          order={order}
          storeName={order.store.business_name ?? ""}
          onClose={() => setCancelling(false)}
          onCancelled={() => {
            setCancelling(false);
            fetchOrder();
          }}
        />
      )}
    </div>
  );
}

export default AdminOrderDetailsPage;
