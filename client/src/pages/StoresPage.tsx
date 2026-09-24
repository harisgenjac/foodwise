import { useState, useEffect } from "react";
import { useFetch } from "../hooks/useFetch.js";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import type { Favorites } from "../types/index.js";
import type { User } from "../types/index.js";
import axios from "axios";

function StoresPage() {
  const navigate = useNavigate();
  const [city, setCity] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const {
    data: storesList,
    loading,
    refetch,
  } = useFetch<User>("/users/stores", "stores", {
    city,
    business_name: businessName,
  });

  const fetchFavorites = async () => {
    try {
      const response = await api.get("/favorites");
      setFavoriteIds(response.data.favorites.map((f: Favorites) => f.id));
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddFavorite = async (storeId: number) => {
    try {
      await api.post(`/favorites`, {
        store_id: storeId,
      });
      fetchFavorites();
      toast.success("Prodavnica uspješno dodana u omiljene.");
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(
        message ||
          "Greška prilikom dodavanja prodavnice u omiljene.",
      );
    }
  };

  const handleRemoveFavorite = async (storeId: number) => {
    try {
      await api.delete(`/favorites/${storeId}`);
      fetchFavorites();
      toast.success("Prodavnica izbrisana iz omiljenih");
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(
        message ||
          "Greška prilikom brisanja prodavnice iz omiljenih.",
      );
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = city || businessName;
  const displayedStores = showFavoritesOnly
    ? storesList.filter((store) => favoriteIds.includes(store.id))
    : storesList;
  return (
    <div className="pb-16">
      <div className="max-w-5xl mx-auto mb-20">
        <h2 className="text-2xl font-semibold mb-6">Prodavnice</h2>
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Pretraga po gradu"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
          <input
            type="text"
            placeholder="Pretraga po imenu prodavnice"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors ${
              showFavoritesOnly
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            ⭐ Samo omiljene
          </button>
        </div>

        {storesList.length === 0 ? (
          <div className="flex flex-col items-center text-center py-20">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mb-4">
              🏪
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              {hasActiveFilters
                ? "Nema rezultata"
                : "Još nijedna prodavnica nije registrovana"}
            </h3>
            <p className="text-gray-500 mb-6">
              {hasActiveFilters
                ? "Pokušajte promijeniti ili ukloniti filtere."
                : "Kada bude registrovana prodavnica, ovdje će biti prikazana."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {displayedStores.map((store) => (
              <div
                key={store.id}
                onClick={() => navigate(`/stores/${store.id}`)}
                className="bg-white rounded-xl shadow overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="relative h-32 bg-linear-to-br from-emerald-700 via-teal-800 to-gray-900 flex items-center justify-center overflow-hidden">
                  {store.logo_url ? (
                    <img
                      src={`http://localhost:3000${store.logo_url}`}
                      alt={store.business_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">🏪</span>
                  )}
                  {favoriteIds.includes(store.id) && (
                    <span className="absolute top-3 right-3 text-xl">⭐</span>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div>
                    <p className="text-xs text-gray-400">{store.city}</p>
                    <h3 className="text-lg font-bold text-gray-800">
                      {store.business_name}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-500 line-clamp-2">
                    {store.description || "Nema dodatnog opisa."}
                  </p>

                  <div className="border-t border-gray-100 pt-3 flex flex-col gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-500">Adresa</span>
                      <span className="font-medium text-gray-700 text-right">
                        {store.address || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-500">Radno vrijeme</span>
                      <span className="font-medium text-gray-700 text-right">
                        {store.opening_hours || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-500">Telefon</span>
                      <span className="font-medium text-gray-700 text-right">
                        {store.phone || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <Link
                      to={`/stores/${store.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-center bg-orange-100 hover:bg-orange-200 transition-colors text-gray-800 font-medium py-2 rounded-lg"
                    >
                      Detalji
                    </Link>
                    {favoriteIds.includes(store.id) ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFavorite(store.id);
                        }}
                        className="flex-1 bg-red-100 hover:bg-red-200 transition-colors text-red-700 font-medium py-2 rounded-lg cursor-pointer"
                      >
                        ★ Ukloni
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddFavorite(store.id);
                        }}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700 font-medium py-2 rounded-lg cursor-pointer"
                      >
                        ☆ Dodaj
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StoresPage;
