import { useState, useEffect } from "react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import { useFetch } from "../hooks/useFetch.js";

function MyReservationsPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [businessName, setBusinessName] = useState("");
  const {
    data: reservationsList,
    loading,
    refetch,
  } = useFetch("/reservations/mine", "reservations", {
    name,
    status,
    business_name: businessName,
  });

  const handleCancellation = async (reservationId) => {
    try {
      const response = await api.patch(`/reservations/${reservationId}/cancel`);
      toast.success(response.data.message);
      refetch()
    } catch (err) {
      console.error("Error canceling reservation:", err);
      toast.error(err.response?.data?.error || "Greška prilikom akcije.");
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = name || status || businessName;

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-semibold mb-6">Moje Rezervacije</h2>

      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Pretraga po imenu proizvoda"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          type="text"
          placeholder="Pretraga po prodavnici"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">-- Status rezervacije --</option>
          <option value="Pending">Na čekanju</option>
          <option value="Confirmed">Potvrđene</option>
          <option value="Completed">Završene</option>
          <option value="Cancelled">Otkazane</option>
        </select>
      </div>

      {reservationsList.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mb-4">
            📋
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            {hasActiveFilters
              ? "Nema rezultata"
              : "Niste kreirali još nijednu rezervaciju"}
          </h3>
          <p className="text-gray-500 mb-6">
            {hasActiveFilters
              ? "Pokušajte promijeniti ili ukloniti filtere."
              : "Kada budete napravili rezervaciju, ona će se pojaviti ovdje."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reservationsList.map((reservation) => (
            <div
              key={reservation.id}
              className="bg-white rounded-xl shadow overflow-hidden flex flex-col"
            >
              <div className="relative h-32 bg-gradient-to-br from-amber-600 via-orange-700 to-gray-900">
                <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
                  {reservation.status}
                </span>
              </div>

              <div className="p-4 flex flex-col gap-3 flex-1">
                <div>
                  <p className="text-xs text-gray-400">
                    {reservation.business_name}
                  </p>
                  <h3 className="text-lg font-bold text-gray-800">
                    {reservation.product_name}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {reservation.description}
                </p>

                <div className="border-t border-gray-100 pt-3 flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-500">Količina</span>
                    <span className="font-medium text-gray-700">
                      {reservation.quantity}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-blue-500">Prodavac</span>
                    <span className="font-medium text-gray-700">
                      {reservation.business_name}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-blue-500">Grad</span>
                    <span className="font-medium text-gray-700">
                      {reservation.city}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-blue-500">Preuzimanje</span>
                    <span className="font-medium text-gray-700">
                      {new Date(reservation.pickup_date).toLocaleString()}
                    </span>
                  </div>
                </div>
                {reservation.status === "Pending" && (
                  <button
                    onClick={() => handleCancellation(reservation.id)}
                    className="mt-auto w-full bg-red-100 hover:bg-red-200 transition-colors text-red-700 font-medium py-2 rounded-lg"
                  >
                    Otkazi rezervaciju
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyReservationsPage;
