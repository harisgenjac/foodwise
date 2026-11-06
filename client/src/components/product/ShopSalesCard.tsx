import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Store } from "lucide-react";
import api from "../../api/axios.js";
import { formatDateTime } from "../../utils/admin.js";
import type { ShopSale } from "../../types/index.js";

interface ShopSalesCardProps {
  productId: number;
  unit: string;
  // Changes after a new entry, so the list loads again.
  reloadKey: number;
}

// The store's "Sold in shop" entries for one of its products, newest first (only the store sees
// them; restaurants see just the lower available quantity). Hidden while there are none.
function ShopSalesCard({ productId, unit, reloadKey }: ShopSalesCardProps) {
  const { t } = useTranslation();
  const [sales, setSales] = useState<ShopSale[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/products/${productId}/shop-sales`)
      .then((response) => {
        if (!cancelled) setSales(response.data.sales);
      })
      .catch((err) => console.error("Error loading shop sales:", err));
    return () => {
      cancelled = true;
    };
  }, [productId, reloadKey]);

  if (sales.length === 0) return null;
  const total = sales.reduce((sum, sale) => sum + parseFloat(sale.quantity), 0);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <Store className="h-4 w-4" strokeWidth={2} />
        </span>
        {t("soldInShop.historyTitle")}
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        {t("soldInShop.historyTotal", { amount: Math.round(total * 1000) / 1000, unit })}
      </p>
      <ul className="divide-y divide-gray-100">
        {sales.map((sale) => (
          <li key={sale.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium text-gray-900">
              {parseFloat(sale.quantity)} {unit}
            </span>
            <span className="text-gray-500">{formatDateTime(sale.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ShopSalesCard;
