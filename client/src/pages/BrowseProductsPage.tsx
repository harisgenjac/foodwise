import { useState } from "react";
import api from "../api/axios.js";
import axios from "axios";
import { CATEGORY_IMAGES } from "../utils/categoryImages.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import { useFetch } from "../hooks/useFetch.js";
import { useNavigate } from "react-router-dom";
import type { Product } from "../types/index.js";
import { useTranslation } from "react-i18next";

function BrowseProductsPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [name, setName] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [reservationQuantity, setReservationQuantity] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const productStatuses = t("productStatus", { returnObjects: true }) as Record<
    string,
    string
  >;
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const {
    data: productsList,
    loading,
    refetch,
  } = useFetch<Product>("/products", "products", {
    category,
    maxPrice,
    name,
    expiryWithinDays,
  });

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
      refetch();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const visibleProducts = productsList.filter(
    (p) => parseFloat(p.available_quantity || "0") > 0,
  );
  const hasActiveFilters = name || category || maxPrice || expiryWithinDays;

  return (
    <div className="pb-16">
      <div className="max-w-5xl mx-auto mb-20">
        <h2 className="text-2xl font-semibold mb-6">
          {t("product.browseTitle")}
        </h2>
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder={t("filters.searchByName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">{t("filters.allCategories")}</option>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder={t("filters.maxPrice")}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
          <select
            value={expiryWithinDays}
            onChange={(e) => setExpiryWithinDays(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">{t("filters.expiryDate")}</option>
            <option value="1">{t("filters.today")}</option>
            <option value="2">{t("filters.tomorrow")}</option>
            <option value="3">{t("filters.within3Days")}</option>
            <option value="7">{t("filters.within7Days")}</option>
          </select>
        </div>

        {visibleProducts.length === 0 ? (
          <div className="flex flex-col items-center text-center py-20">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mb-4">
              🔍
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              {hasActiveFilters
                ? t("myProducts.noResultsTitle")
                : t("product.noAvailableProductsTitle")}
            </h3>
            <p className="text-gray-500 mb-6">
              {hasActiveFilters
                ? t("myProducts.noResultsSubtitle")
                : t("product.noAvailableProductsSubtitle")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {visibleProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => navigate(`/products/${product.id}`)}
                className="bg-white rounded-xl cursor-pointer shadow overflow-hidden flex flex-col"
              >
                <div className="relative h-32">
                  <img
                    src={
                      CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other
                    }
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
                    {categories[product.category] || product.category}
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div>
                    <p className="text-xs text-gray-400">
                      {product.business_name} - {product.city}
                    </p>
                    <h3 className="text-lg font-bold text-gray-800">
                      {product.name}
                    </h3>
                  </div>

                  <span className="w-fit text-xs font-medium px-2 py-1 rounded-full bg-orange-50 text-orange-600">
                    {productStatuses[product.status] || product.status}
                  </span>

                  <p className="text-sm text-gray-500 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="border-t border-gray-100 pt-3 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-500">
                        {t("dashboard.price")}
                      </span>
                      <span className="text-right">
                        <span className="line-through text-gray-400 mr-1">
                          {product.original_price} KM
                        </span>
                        <span className="text-green-600 font-semibold">
                          {product.discounted_price} KM
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-500">{t("product.available")}</span>
                      <span className="font-medium text-gray-700">
                        {product.available_quantity}{" "}
                        {units[product.unit] || product.unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-500">
                        {t("dashboard.expiryDate")}
                      </span>
                      <span className="font-medium text-gray-700">
                        {new Date(product.expiry_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

export default BrowseProductsPage;
