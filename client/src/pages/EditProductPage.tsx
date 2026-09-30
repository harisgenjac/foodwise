import { useState, useEffect } from "react";
import api from "../api/axios.js";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { Product } from "../types/index.js";
import { useTranslation } from "react-i18next";

function EditProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [original_price, setOriginalPrice] = useState("");
  const [discounted_price, setDiscountedPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [expiry_date, setExpiryDate] = useState("");
  const [error, setError] = useState("");
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const units = t("units", { returnObjects: true }) as Record<string, string>;

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products/" + id);
      const data: Product = response.data.product;
      setName(data.name);
      setDescription(data.description);
      setCategory(data.category);
      setOriginalPrice(data.original_price);
      setDiscountedPrice(data.discounted_price);
      setQuantity(data.quantity);
      setUnit(data.unit);
      setExpiryDate(data.expiry_date.slice(0, 10));
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [id]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !name ||
      !description ||
      !category ||
      !original_price ||
      !discounted_price ||
      !quantity ||
      !unit ||
      !expiry_date
    ) {
      setError(t("product.fillAllFields"));
      return;
    }
    try {
      const response = await api.put("/products/" + id, {
        name,
        description,
        category,
        original_price,
        discounted_price,
        quantity,
        unit,
        expiry_date,
      });
      toast.success(response.data.message);
      navigate("/my-products");
    } catch (err) {
      setError(t("product.editError"));
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("product.editError"));
    }
  };

  const inputStyle =
    "w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-2xl font-bold mb-6">{t("product.editTitle")}</h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.name")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.description")}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.category")}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("product.selectCategory")}</option>
             {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.originalPrice")}
          </label>
          <input
            type="number"
            placeholder={t("product.originalPrice")}
            value={original_price}
            onChange={(e) => setOriginalPrice(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.discountedPrice")}
          </label>
          <input
            type="number"
            placeholder={t("product.discountedPrice")}
            value={discounted_price}
            onChange={(e) => setDiscountedPrice(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.quantity")}
          </label>
          <input
            type="number"
            placeholder={t("product.quantity")}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.unit")}
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("product.selectUnit")}</option>
            {Object.entries(units).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("product.expiryDate")}
          </label>
          <input
            type="date"
            value={expiry_date}
            onChange={(e) => setExpiryDate(e.target.value)}
            className={inputStyle}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 transition-colors text-white font-medium py-2 rounded-lg"
        >
          {t("product.editButton")}
        </button>
      </form>
    </div>
  );
}

export default EditProductPage;
