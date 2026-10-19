import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardProductCard from "../dashboard/DashboardProductCard.jsx";
import { toDateInput } from "../../utils/expiry.js";
import type { Product, ProductFormValues } from "../../types/index.js";

interface ProductPreviewProps {
  values: ProductFormValues;
}

// Live, non-interactive card showing how restaurants will see the product being edited.
function ProductPreview({ values }: ProductPreviewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const previewProduct: Product = {
    id: 0,
    store_id: user?.id ?? 0,
    name: values.name || t("product.previewName"),
    description: values.description || t("product.previewDescription"),
    category: values.category || "Other",
    original_price: values.original_price || "0",
    discounted_price: values.discounted_price || "0",
    quantity: values.quantity || "0",
    unit: values.unit || "kom",
    expiry_date: values.expiry_date || toDateInput(new Date()),
    status: "Available",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(user?.business_name ? { business_name: user.business_name } : {}),
    ...(user?.city ? { city: user.city } : {}),
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
        <Eye className="h-4 w-4 text-orange-600" />
        {t("product.previewTitle")}
      </h2>
      <p className="mb-4 text-xs text-gray-500">{t("product.previewHint")}</p>
      <div aria-hidden="true" className="pointer-events-none select-none">
        <DashboardProductCard product={previewProduct} showStore />
      </div>
    </div>
  );
}

export default ProductPreview;
