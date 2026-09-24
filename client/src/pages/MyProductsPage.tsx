import { useState } from "react";
import api from "../api/axios.js";
import { useNavigate } from "react-router-dom";
import { CATEGORY_LABELS } from "../utils/categories.js";
import { CATEGORY_IMAGES } from "../utils/categoryImages.js";
import { Link } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import { useFetch } from "../hooks/useFetch.js";
import type { Product } from "../types/index.js";
import axios from "axios";

function MyProductsPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Available");
  const [category, setCategory] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const {
    data: productsList,
    loading,
    refetch,
  } = useFetch<Product>("/products/mine", "products", {
    name,
    status,
    category,
    expiryWithinDays,
  });

  const handleDelete = async (productId: number) => {
    try {
      await api.delete(`/products/${productId}`);
      setSelectedProduct(null);
      refetch();
      toast.success("Proizvod uspješno obrisan.");
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(
        message || "Greška prilikom brisanja proizvoda.",
      );
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters =
    name || category || expiryWithinDays || status !== "Available";

  return (
    <div className="pb-16">
      <div className="max-w-5xl mx-auto mb-20">
        <h2 className="text-2xl font-semibold mb-6">Moji Proizvodi</h2>
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Pretraga po imenu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">-- Sve kategorije --</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">-- Status proizvoda --</option>
            <option value="Available">Dostupno</option>
            <option value="Sold">Prodano</option>
            <option value="Expired">Istekao rok</option>
          </select>
          <select
            value={expiryWithinDays}
            onChange={(e) => setExpiryWithinDays(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">-- Rok trajanja --</option>
            <option value="1">Danas</option>
            <option value="2">Sutra</option>
            <option value="3">Unutar 3 dana</option>
            <option value="7">Unutar 7 dana</option>
          </select>
        </div>

        {productsList.length === 0 ? (
          <div className="flex flex-col items-center text-center py-20">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mb-4">
              📦
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              {hasActiveFilters
                ? "Nema rezultata"
                : "Nemate još nijedan proizvod"}
            </h3>
            <p className="text-gray-500 mb-6">
              {hasActiveFilters
                ? "Pokušajte promijeniti ili ukloniti filtere."
                : "Dodajte svoj prvi proizvod i počnite smanjivati bacanje hrane."}
            </p>
            {!hasActiveFilters && (
              <Link
                to="/add-product"
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2 rounded-full transition-colors"
              >
                Dodaj proizvod <span>→</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {productsList.map((product: Product) => (
              <div
                key={product.id}
                onClick={() => navigate(`/products/${product.id}`)}
                className="bg-white rounded-xl shadow overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow"
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
                    {CATEGORY_LABELS[product.category] || product.category}
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div>
                    <p className="text-xs text-gray-400">{new Date(product.created_at).toLocaleString()}</p>
                    <h3 className="text-lg font-bold text-gray-800">
                      {product.name}
                    </h3>
                  </div>

                  <span className="w-fit text-xs font-medium px-2 py-1 rounded-full bg-orange-50 text-orange-600">
                    {product.status}
                  </span>

                  <p className="text-sm text-gray-500 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="border-t border-gray-100 pt-3 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-500">Cijena</span>
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
                      <span className="text-blue-500">Količina</span>
                      <span className="font-medium text-gray-700">
                        {product.quantity} {product.unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-500">Rok trajanja</span>
                      <span className="font-medium text-gray-700">
                        {new Date(product.expiry_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <Link
                      to={`/edit-product/${product.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-center bg-orange-100 hover:bg-orange-200 transition-colors text-gray-800 font-medium py-2 rounded-lg"
                    >
                      Uredi
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProduct(product);
                      }}
                      className="flex-1 bg-red-100 hover:bg-red-200 transition-colors text-red-700 font-medium py-2 rounded-lg cursor-pointer"
                    >
                      Obriši
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
              Da li ste sigurni da želite obrisati ovaj proizvod?
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg"
              >
                Otkaži
              </button>
              <button
                onClick={() => handleDelete(selectedProduct.id)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded-lg"
              >
                Izbriši
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyProductsPage;
