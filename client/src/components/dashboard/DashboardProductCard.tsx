import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Store } from "lucide-react";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { getDaysUntilExpiry } from "../../utils/expiry.js";
import { PRODUCT_STATUS_STYLES } from "../../utils/productStatus.js";
import { formatCityDistance } from "../../utils/radius.js";
import StoreNameLink from "../store/StoreNameLink.js";
import ChainLabel from "../store/ChainLabel.js";
import type { Product } from "../../types/index.js";

interface DashboardProductCardProps {
  product: Product;
  showStore?: boolean;
  // Replaces the default "Details" link, e.g. with edit/delete or reserve buttons.
  actions?: ReactNode;
}

function DashboardProductCard({ product, showStore = false, actions }: DashboardProductCardProps) {
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<string, string>;
  const productStatuses = t("productStatus", { returnObjects: true }) as Record<string, string>;
  const units = t("units", { returnObjects: true }) as Record<string, string>;

  const expiryStyle =
    getDaysUntilExpiry(product) <= 3 ? "text-red-600" : "text-gray-800";

  return (
    <div data-testid="product-card" className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-36 overflow-hidden">
        <img
          src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-transparent" />
        <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
          {categories[product.category] || product.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          {showStore ? (
            // The store name links to its profile; the product name below stays the main text.
            <p className="flex min-w-0 items-center gap-1 text-xs text-gray-400">
              <Store className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
              {product.business_name && (
                <StoreNameLink storeId={product.store_id} name={product.business_name} />
              )}
              <ChainLabel company={product.company_name} className="px-1.5" />
              {product.city && (
                <span className="shrink-0">
                  {product.business_name && "· "}
                  {formatCityDistance(t, product.city, product.distance_km)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-400">{new Date(product.created_at).toLocaleDateString()}</p>
          )}
          <h3 className="text-lg font-bold text-gray-800 line-clamp-1">{product.name}</h3>
        </div>

        <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${PRODUCT_STATUS_STYLES[product.status]}`}>
          {productStatuses[product.status] || product.status}
        </span>

        {product.description && (
          <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
        )}

        <dl className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.price")}</dt>
            <dd className="text-right">
              <span className="mr-1 text-gray-400 line-through">{product.original_price} KM</span>
              <span className="font-semibold text-green-600">{product.discounted_price} KM</span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.quantity")}</dt>
            <dd className="font-medium text-gray-800">
              {product.available_quantity ?? product.quantity} {units[product.unit] || product.unit}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.expiryDate")}</dt>
            <dd className={`font-medium ${expiryStyle}`}>
              {new Date(product.expiry_date).toLocaleDateString()}
            </dd>
          </div>
        </dl>

        {actions ? (
          <div className="mt-auto flex gap-2">{actions}</div>
        ) : (
          <Link
            to={`/products/${product.id}`}
            className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
          >
            {t("dashboard.detailsButton")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default DashboardProductCard;
