import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios.js";
import { CATEGORY_IMAGES } from "../utils/categoryImages.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import type { Product } from "../types/index.js";
import axios from "axios";
import { useTranslation } from "react-i18next";


function ProductDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [reservationQuantity, setReservationQuantity] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
      toast.error(message || t("reservations.actionError"));
    }
  };

  const handleReservation = async () => {
    try {
      await api.post("/reservations", {
        product_id: selectedProduct!.id,
        quantity: reservationQuantity,
        pickup_date: pickupDate,
      });
      toast.success(t("myProducts.reservationCreated"));
      setSelectedProduct(null);
      setReservationQuantity("");
      setPickupDate("");
      fetchProduct();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-gray-500">{t("myProducts.productNotFoundTitle")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← {t("myProducts.backButton")}
      </button>

      <div className="bg-white rounded-2xl shadow overflow-hidden md:flex">
        <img
          src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other}
          alt={product.name}
          className="w-full md:w-2/5 h-64 md:h-auto object-cover shrink-0"
        />

        <div className="flex-1 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
            <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-full bg-orange-50 text-orange-600">
              {productStatuses[product.status] || product.status}
            </span>
          </div>

          <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 mb-4">
            {categories[product.category] || product.category}
          </span>

          <p className="text-gray-600 mb-6">{product.description}</p>

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-lg line-through text-gray-400">
              {product.original_price} KM
            </span>
            <span className="text-3xl font-bold text-green-600">
              {product.discounted_price} KM
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
            <div>
              <p className="text-xs text-gray-400 mb-1">{t("myProducts.store")}</p>
              <p className="font-semibold text-gray-800">
                {product.business_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t("dashboard.city")}</p>
              <p className="font-semibold text-gray-800">{product.city}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t("myProducts.availableQuantity")}</p>
              <p className="font-semibold text-gray-800">
                {product.available_quantity}{" "}
                {units[product.unit] || product.unit}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t("myProducts.totalQuantity")}</p>
              <p className="font-semibold text-gray-800">
                {product.quantity} {units[product.unit] || product.unit}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t("dashboard.expiryDate")}</p>
              <p className="font-semibold text-gray-800">
                {new Date(product.expiry_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t("myProducts.daysUntilExpiry")}</p>
              <p className="font-semibold text-gray-800">
                {product.days_until_expiry}
              </p>
            </div>
          </div>

          {user?.role === "STORE" && (
            <div className="mt-6 pt-6 border-t border-gray-100 flex gap-2">
              <Link
                to={`/edit-product/${product.id}`}
                className="flex-1 text-center bg-orange-100 hover:bg-orange-200 transition-colors text-gray-800 font-medium py-2 rounded-lg"
              >
                {t("myProducts.editButton")}
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex-1 bg-red-100 hover:bg-red-200 transition-colors text-red-700 font-medium py-2 rounded-lg cursor-pointer"
              >
                {t("myProducts.deleteButton")}
              </button>
            </div>
          )}
          {user?.role === "RESTAURANT" && (
            <div className="mt-6 pt-6 border-t border-gray-100 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedProduct(product);
                }}
                className="flex-1 bg-orange-100 cursor-pointer hover:bg-orange-200 transition-colors text-gray-800 font-medium py-2 rounded-lg"
              >
                {t("myProducts.reserveButton")}
              </button>
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">
              {t("myProducts.deleteConfirmation")}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg"
              >
                {t("myProducts.cancelButton")}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded-lg"
              >
                {t("myProducts.confirmDeleteButton")}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">
              {t("myReservations.reservePopupTitle")}: {selectedProduct.name}
            </h3>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("dashboard.quantity")} ({selectedProduct.unit})
            </label>
            <input
              type="number"
              placeholder={`${t("myReservations.placeholderMax")}: ${selectedProduct.available_quantity}`}
              value={reservationQuantity}
              onChange={(e) => setReservationQuantity(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("myReservations.pickupDate")}
            </label>
            <input
              type="datetime-local"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-6"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg"
              >
                {t("myReservations.cancelButton")}
              </button>
              <button
                onClick={handleReservation}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded-lg"
              >
                {t("myReservations.confirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductDetailsPage;
