import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import toast from "react-hot-toast";
import type { Reservation } from "../types/index.js";
import axios from "axios";

function ReservationDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReservation = async () => {
    try {
      const response = await api.get("/reservations/" + id);
      const data: Reservation = response.data.reservation
      setReservation(data);
    } catch (err) {
      console.error("Error fetching reservation:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (reservationId: number) => {
    try {
      const response = await api.patch(`/reservations/${reservationId}/accept`);
      toast.success(response.data.message);
      fetchReservation();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || "Greška prilikom akcije.");
    }
  };

  const handleReject = async (reservationId: number) => {
    try {
      const response = await api.patch(`/reservations/${reservationId}/reject`);
      toast.success(response.data.message);
      fetchReservation();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || "Greška prilikom akcije.");
    }
  };
  const handleCancellation = async (reservationId: number) => {
    try {
      const response = await api.patch(`/reservations/${reservationId}/cancel`);
      toast.success(response.data.message);
      fetchReservation();
    } catch (err) {
      console.error("Error canceling reservation:", err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || "Greška prilikom akcije.");
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!reservation) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-gray-500">Rezervacija nije pronađena.</p>
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

      <div className="bg-white rounded-2xl shadow overflow-hidden md:flex">
        <img
          src="https://st2.depositphotos.com/1734074/8285/v/450/depositphotos_82857018-stock-illustration-paper-bag-full-of-food.jpg"
          alt={reservation.product_name}
          className="w-full md:w-2/5 h-64 md:h-auto object-cover shrink-0"
        />

        <div className="flex-1 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-2xl font-bold text-gray-800">
              {reservation.product_name}
            </h1>
            <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-full bg-orange-50 text-orange-600">
              {reservation.status}
            </span>
          </div>

          <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 mb-4">
            {reservation.category}
          </span>

          <p className="text-gray-600 mb-6">{reservation.description}</p>

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-lg line-through text-gray-400">
              {reservation.original_price} KM
            </span>
            <span className="text-3xl font-bold text-green-600">
              {reservation.discounted_price} KM
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
            <div>
              <p className="text-xs text-gray-400 mb-1">Rezervisana količina</p>
              <p className="font-semibold text-gray-800">
                {reservation.quantity}{" "}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">Isporuka</p>
              <p className="font-semibold text-gray-800">
                {new Date(reservation.pickup_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Grad</p>
              <p className="font-semibold text-gray-800">{reservation.city}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Prodavac</p>
              <p className="font-semibold text-gray-800">
                {reservation.business_name}
              </p>
            </div>
          </div>

          {user?.role === "STORE" && reservation.status === "Pending" && (
            <div className="mt-6 pt-6 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => handleAccept(reservation.id)}
                className="flex-1 text-center bg-green-100 cursor-pointer hover:bg-green-200 transition-colors text-green-700 font-medium py-2 rounded-lg"
              >
                Prihvati
              </button>
              <button
                onClick={() => handleReject(reservation.id)}
                className="flex-1 bg-red-100 hover:bg-red-200 transition-colors text-red-700 font-medium py-2 rounded-lg cursor-pointer"
              >
                Odbij
              </button>
            </div>
          )}

          {user?.role === "RESTAURANT" && reservation.status === "Pending" && (
            <div className="mt-6 pt-6 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => handleCancellation(reservation.id)}
                className="flex-1 text-center bg-red-100 cursor-pointer hover:bg-red-200 transition-colors text-red-700 font-medium py-2 rounded-lg"
              >
                Otkazi rezervaciju
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReservationDetailsPage;
