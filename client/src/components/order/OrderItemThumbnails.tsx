import { useTranslation } from "react-i18next";
import ProductImage from "../product/ProductImage.js";
import type { Order } from "../../types/index.js";

const SHOWN = 3;

// Small round images of an order's first products, overlapping, with "+N" for the rest.
function OrderItemThumbnails({ order }: { order: Pick<Order, "items" | "item_count"> }) {
  const { t } = useTranslation();
  const shown = order.items.slice(0, SHOWN);
  const more = order.item_count - shown.length;
  if (shown.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center" aria-label={t("orders.itemCount", { count: order.item_count })}>
      <div className="flex -space-x-2">
        {shown.map((item) => (
          <ProductImage
            key={item.id}
            imageUrl={item.image_url}
            alt={item.product_name}
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white"
          />
        ))}
      </div>
      {more > 0 && (
        <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">
          +{more}
        </span>
      )}
    </div>
  );
}

export default OrderItemThumbnails;
