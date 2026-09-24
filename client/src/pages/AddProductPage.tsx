import { useState } from "react";
import api from "../api/axios.js";
import axios from 'axios';
import { useNavigate } from "react-router-dom";
import { CATEGORY_LABELS } from "../utils/categories.js";
import { UNIT_LABELS } from "../utils/units.js";
import toast from "react-hot-toast";

function AddProductPage() {
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
      setError("Molimo popunite sva polja.");
      return;
    }
    try {
      await api.post("/products", {
        name,
        description,
        category,
        original_price,
        discounted_price,
        quantity,
        unit,
        expiry_date,
      });
      toast.success("Proizvod uspješno kreiran.");
      navigate("/dashboard");
    } catch (err) {
      setError("Greška prilikom dodavanja proizvoda. Molimo pokušajte ponovo.");
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(
        message ||
          "Greška prilikom dodavanja proizvoda. Molimo pokušajte ponovo.",
      );
    }
  };

  const inputStyle =
    "w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-2xl font-bold mb-6">Dodaj proizvod</h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Naziv proizvoda
          </label>
          <input
            type="text"
            placeholder="Naziv proizvoda"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Opis
          </label>
          <input
            type="text"
            placeholder="Opis proizvoda"
            value={description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Kategorija
          </label>
          <select
            value={category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
            className={inputStyle}
          >
            <option value="">-- Odaberite kategoriju --</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Originalna cijena
          </label>
          <input
            type="number"
            placeholder="Originalna cijena"
            value={original_price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOriginalPrice(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Snižena cijena
          </label>
          <input
            type="number"
            placeholder="Snižena cijena"
            value={discounted_price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDiscountedPrice(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Količina
          </label>
          <input
            type="number"
            placeholder="Količina"
            value={quantity}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantity(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jedinica mjere
          </label>
          <select
            value={unit}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUnit(e.target.value)}
            className={inputStyle}
          >
            <option value="">-- Odaberite jedinicu --</option>
            {Object.entries(UNIT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Datum isteka
          </label>
          <input
            type="date"
            value={expiry_date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpiryDate(e.target.value)}
            className={inputStyle}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 transition-colors text-white font-medium py-2 rounded-lg"
        >
          Dodaj proizvod
        </button>
      </form>
    </div>
  );
}

export default AddProductPage;
