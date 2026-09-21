import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api/axios.js";
import { useFetch } from "../hooks/useFetch.js";
import { CATEGORY_LABELS } from "../utils/categories.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import {
  CATEGORY_IMAGES,
  RESERVATION_DEFAULT_IMAGE,
} from "../utils/categoryImages.js";

function StoreDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [myReservations, setMyReservations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState("products");
  const [reservationStatus, setReservationStatus] = useState("");

  const fetchStoreDetails = async () => {
    try {
      const response = await api.get(`/users/stores/${id}`);
      setStore(response.data.store);
      setProducts(response.data.products);
      setStats(response.data.stats);
      setMyReservations(response.data.myReservations);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFavorites = async () => {
    try {
      const response = await api.get("/favorites");
      setIsFavorite(response.data.favorites.some((f) => f.id === parseInt(id)));
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddFavorite = async () => {
    try {
      await api.post(`/favorites`, { store_id: id });
      setIsFavorite(true);
      toast.success("Prodavnica uspješno dodana u omiljene.");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Greška prilikom akcije.");
    }
  };

  const handleRemoveFavorite = async () => {
    try {
      await api.delete(`/favorites/${id}`);
      setIsFavorite(false);
      toast.success("Prodavnica izbrisana iz omiljenih.");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Greška prilikom akcije.");
    }
  };

  useEffect(() => {
    fetchStoreDetails();
    fetchFavorites();
  }, [id]);

  // Poseban hook SAMO za "Moje rezervacije" tab, sa filterom po statusu
  const { data: reservationsList, loading: reservationsLoading } = useFetch(
    "/reservations/mine",
    "reservations",
    {
      store_id: id,
      status: reservationStatus,
    },
  );

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!store) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-gray-500">Prodavnica nije pronađena.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← Nazad
      </button>

      <div className="bg-white rounded-2xl shadow overflow-hidden md:flex mb-8">
        <div className="w-full md:w-2/5 h-48 md:h-auto bg-gradient-to-br from-emerald-700 via-teal-800 to-gray-900 flex items-center justify-center shrink-0 overflow-hidden">
          {store.logo_url ? (
            <img
              src={`http://localhost:3000${store.logo_url}`}
              alt={store.business_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-6xl">🏪</span>
          )}
        </div>

        <div className="flex-1 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-2xl font-bold text-gray-800">
              {store.business_name}
            </h1>
            <button
              onClick={isFavorite ? handleRemoveFavorite : handleAddFavorite}
              className="shrink-0 text-2xl cursor-pointer"
              title={isFavorite ? "Ukloni iz omiljenih" : "Dodaj u omiljene"}
            >
              {isFavorite ? "⭐" : "☆"}
            </button>
          </div>

          <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 mb-4">
            {store.city}
          </span>

          <p className="text-gray-600 mb-6">
            {store.description || "Nema dodatnog opisa."}
          </p>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
            <div>
              <p className="text-xs text-gray-400 mb-1">Adresa</p>
              <p className="font-semibold text-gray-800">
                {store.address || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Telefon</p>
              <p className="font-semibold text-gray-800">
                {store.phone || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Radno vrijeme</p>
              <p className="font-semibold text-gray-800">
                {store.opening_hours || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Vrijeme preuzimanja</p>
              <p className="font-semibold text-gray-800">
                {store.pickup_hours || "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 border-t border-gray-100 pt-6 mt-6 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">
                {products.length}
              </p>
              <p className="text-xs text-gray-400">Aktivnih proizvoda</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">
                {stats.sold_articles}
              </p>
              <p className="text-xs text-gray-400">Prodano artikala</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {stats.successful_reservations}
              </p>
              <p className="text-xs text-gray-400">Uspješno isporučeno</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">
                {myReservations.my_reservations_count}
              </p>
              <p className="text-xs text-gray-400">Vaših rezervacija ovdje</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabovi */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2 font-medium cursor-pointer ${
            activeTab === "products"
              ? "border-b-2 border-orange-500 text-orange-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Proizvodi
        </button>
        <button
          onClick={() => setActiveTab("reservations")}
          className={`px-4 py-2 font-medium cursor-pointer ${
            activeTab === "reservations"
              ? "border-b-2 border-orange-500 text-orange-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Moje rezervacije
        </button>
      </div>

      {activeTab === "products" && (
        <div>
          {products.length === 0 ? (
            <p className="text-center text-gray-500 py-10">
              Ova prodavnica trenutno nema dostupnih proizvoda.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {products.map((product) => (
                <div
                  key={product.id}
                  onClick={() => navigate(`/products/${product.id}`)}
                  className="bg-white rounded-xl shadow overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="relative h-32">
                    <img
                      src={
                        CATEGORY_IMAGES[product.category] ||
                        CATEGORY_IMAGES.Other
                      }
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
                      {CATEGORY_LABELS[product.category] || product.category}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <h3 className="text-lg font-bold text-gray-800">
                      {product.name}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm line-through text-gray-400">
                        {product.original_price} KM
                      </span>
                      <span className="text-lg font-bold text-green-600">
                        {product.discounted_price} KM
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Dostupno: {product.available_quantity} {product.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "reservations" && (
        <div>
          <div className="mb-6">
            <select
              value={reservationStatus}
              onChange={(e) => setReservationStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">-- Svi statusi --</option>
              <option value="Pending">Na čekanju</option>
              <option value="Confirmed">Potvrđene</option>
              <option value="Completed">Završene</option>
              <option value="Cancelled">Otkazane</option>
            </select>
          </div>

          {reservationsLoading ? (
            <LoadingSpinner />
          ) : reservationsList.length === 0 ? (
            <p className="text-center text-gray-500 py-10">
              Nemate rezervacija kod ove prodavnice.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reservationsList.map((reservation) => (
                <div
                  key={reservation.id}
                  onClick={() => navigate(`/reservation/${reservation.id}`)}
                  className="bg-white rounded-xl shadow overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="relative h-32">
                    <img
                      src={RESERVATION_DEFAULT_IMAGE}
                      alt={reservation.product_name}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
                      {reservation.status}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <h3 className="text-lg font-bold text-gray-800">
                      {reservation.product_name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Količina: {reservation.quantity}
                    </p>
                    <p className="text-sm text-gray-500">
                      Preuzimanje:{" "}
                      {new Date(reservation.pickup_date).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StoreDetailsPage;
