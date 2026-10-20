import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Clock,
  HandHeart,
  Hourglass,
  Info,
  MapPin,
  Package,
  PackagePlus,
  Pencil,
  Phone,
  Scale,
  SearchX,
  Store,
  Trash2,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import EmptyState from "../components/product/EmptyState.js";
import Modal from "../components/product/Modal.js";
import DetailItem from "../components/product/DetailItem.js";
import ReserveProductModal from "../components/product/ReserveProductModal.js";
import DonateProductModal from "../components/donation/DonateProductModal.js";
import { CATEGORY_IMAGES } from "../utils/categoryImages.js";
import { PRODUCT_STATUS_STYLES } from "../utils/productStatus.js";
import { getDaysUntilExpiry } from "../utils/expiry.js";
import type { Product } from "../types/index.js";

function ProductDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [donating, setDonating] = useState(false);
  const { t } = useTranslation();
  const productStatuses = t("productStatus", { returnObjects: true }) as Record<
    string,
    string
  >;
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const units = t("units", { returnObjects: true }) as Record<string, string>;

  const fetchProduct = async () => {
    try {
      const response = await api.get("/products/" + id);
      const data: Product = response.data.product;
      setProduct(data);
    } catch (err) {
      console.error("Error fetching product:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/products/${id}`);
      toast.success(t("myProducts.deleteSuccess"));
      navigate("/my-products");
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("myProducts.deleteError"));
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const isStore = user?.role === "STORE";

  if (!product) {
    return (
      <div className="max-w-5xl mx-auto pb-10">
        <EmptyState
          icon={SearchX}
          title={t("myProducts.productNotFoundTitle")}
          subtitle={t("myProducts.notFoundSubtitle")}
          action={{
            to: isStore ? "/my-products" : "/browse-products",
            label: t("myProducts.backToList"),
          }}
        />
      </div>
    );
  }

  const unit = units[product.unit] || product.unit;
  const isOwner = isStore && product.store_id === user?.id;
  const quantity = parseFloat(product.quantity);
  const available = parseFloat(product.available_quantity ?? product.quantity);
  const reserved = Math.max(quantity - available, 0);
  const availablePercent = quantity > 0 ? Math.round((available / quantity) * 100) : 0;
  const originalPrice = Number(product.original_price);
  const discountedPrice = Number(product.discounted_price);
  const discountPercent =
    originalPrice > 0
      ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
      : 0;
  const daysUntilExpiry = getDaysUntilExpiry(product);
  const expiryLabel =
    daysUntilExpiry <= 0
      ? t("product.expiresToday")
      : daysUntilExpiry === 1
        ? t("product.expiresTomorrow")
        : t("product.expiresInDays", { count: daysUntilExpiry });
  const isUrgent = daysUntilExpiry <= 3;
  const canReserve =
    user?.role === "RESTAURANT" && product.status === "Available" && available > 0;
  // The server refuses to delete Sold, Expired or Removed products.
  const canDelete = product.status === "Available";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("myProducts.backButton")}
      </button>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:flex">
        <div className="relative h-56 shrink-0 md:h-auto md:w-2/5">
          <img
            src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other}
            alt={product.name}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-transparent" />
          <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold">
            {categories[product.category] || product.category}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-5 p-6 md:p-8">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PRODUCT_STATUS_STYLES[product.status]}`}
              >
                {productStatuses[product.status] || product.status}
              </span>
              {product.status === "Available" && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isUrgent ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <Hourglass className="h-3 w-3" />
                  {expiryLabel}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              {product.name}
            </h1>
            {!isOwner && product.business_name && (
              <p className="mt-1 text-sm text-gray-500">
                {[product.business_name, product.city].filter(Boolean).join(" · ")}
              </p>
            )}
            {product.description && (
              <p className="mt-2 text-gray-600">{product.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold text-green-600">
              {product.discounted_price} KM
            </span>
            <span className="text-lg text-gray-400 line-through">
              {product.original_price} KM
            </span>
            {discountPercent > 0 && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                {t("product.discountBadge", { percent: discountPercent })}
              </span>
            )}
            <span className="text-sm text-gray-500">/ {unit}</span>
          </div>

          <dl className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <DetailItem
              icon={Scale}
              label={t("myProducts.availableQuantity")}
              value={`${available} ${unit}`}
            />
            <DetailItem
              icon={Package}
              label={t("myProducts.totalQuantity")}
              value={`${product.quantity} ${unit}`}
            />
            <DetailItem
              icon={CalendarClock}
              label={t("dashboard.expiryDate")}
              value={new Date(product.expiry_date).toLocaleDateString()}
              valueClassName={isUrgent && product.status === "Available" ? "text-red-600" : "text-gray-900"}
            />
            <DetailItem
              icon={PackagePlus}
              label={t("myProducts.createdAt")}
              value={new Date(product.created_at).toLocaleDateString()}
            />
          </dl>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{t("myProducts.stockTitle")}</span>
              <span className="text-gray-500">
                {t("myProducts.reservedQuantity")}: {reserved} {unit}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${availablePercent}%` }}
              />
            </div>
          </div>

          {isOwner && (
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <Link
                to={`/edit-product/${product.id}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
              >
                <Pencil className="h-4 w-4" />
                {t("myProducts.editButton")}
              </Link>
              {product.status === "Available" && available > 0 && (
                <button
                  type="button"
                  onClick={() => setDonating(true)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                >
                  <HandHeart className="h-4 w-4" />
                  {t("donations.fromProduct.button")}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("myProducts.deleteButton")}
                </button>
              )}
            </div>
          )}

          {user?.role === "RESTAURANT" &&
            (canReserve ? (
              <button
                type="button"
                onClick={() => setReserving(true)}
                className="mt-auto inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
              >
                <CalendarPlus className="h-4 w-4" />
                {t("myProducts.reserveButton")}
              </button>
            ) : (
              <p className="mt-auto flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <Info className="h-4 w-4 shrink-0 text-gray-400" />
                {t("myProducts.notAvailable")}
              </p>
            ))}
        </div>
      </section>

      {!isOwner && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Store className="h-4 w-4" strokeWidth={2} />
            </span>
            {t("myProducts.store")}
          </h2>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-lg font-bold text-gray-900">
                {product.business_name || "-"}
              </p>
              {(product.store_address || product.city) && (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  {[product.store_address, product.city].filter(Boolean).join(", ")}
                </p>
              )}
              {product.store_phone && (
                <a
                  href={`tel:${product.store_phone}`}
                  className="flex w-fit items-center gap-2 text-sm font-medium text-orange-700 hover:underline"
                >
                  <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                  {product.store_phone}
                </a>
              )}
              {product.store_pickup_hours && (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                  {t("reservations.pickupHours")}: {product.store_pickup_hours}
                </p>
              )}
            </div>

            {user?.role === "RESTAURANT" && (
              <Link
                to={`/stores/${product.store_id}`}
                className="group inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
              >
                {t("reservations.viewStore")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </section>
      )}

      {donating && (
        <DonateProductModal
          product={product}
          onClose={() => setDonating(false)}
          onDonated={() => navigate("/donate-food")}
        />
      )}

      {showDeleteConfirm && (
        <Modal onClose={() => setShowDeleteConfirm(false)}>
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="text-lg font-bold text-gray-900">
              {t("myProducts.deleteConfirmation")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {t("myProducts.deleteConfirmationText", { name: product.name })}
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("myProducts.cancelButton")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 cursor-pointer rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
            >
              {t("myProducts.confirmDeleteButton")}
            </button>
          </div>
        </Modal>
      )}

      {reserving && (
        <ReserveProductModal
          product={product}
          onClose={() => setReserving(false)}
          onReserved={fetchProduct}
        />
      )}
    </div>
  );
}

export default ProductDetailsPage;
