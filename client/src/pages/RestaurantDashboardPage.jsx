import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import { CATEGORY_LABELS } from "../utils/categories.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";

const RestaurantDashboardPage = () => {
  const [productsList, setProductsList] = useState([]);
  const [reservationsList, setReservationsList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products");
      setProductsList(response.data.products);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchReservations = async () => {
    try {
      const response = await api.get("/reservations/mine");
      setReservationsList(response.data.reservations);
    } catch (err) {
      console.error("Error fetching reservations:", err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchProducts(), fetchReservations()]);

      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="pb-16">
      <div
        className="relative rounded-lg overflow-hidden mb-16 h-40 flex flex-col items-center justify-center text-center bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200')",
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 text-white">
          <h1 className="text-4xl font-bold">Welcome to FoodWise</h1>
          <p className="mt-2 text-lg">Less waste. More taste.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mb-20">
        <h2 className="text-2xl font-semibold mb-6">Proizvodi</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {productsList.slice(0, 3).map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow overflow-hidden flex flex-col"
            >
              <div className="relative h-32 bg-gradient-to-br from-emerald-700 via-teal-800 to-gray-900">
                <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
                  {CATEGORY_LABELS[product.category] || product.category}
                </span>
              </div>

              <div className="p-4 flex flex-col gap-3 flex-1">
                <div>
                  <p className="text-xs text-gray-400">{product.unit}</p>
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

                <button className="mt-auto w-full bg-orange-100 hover:bg-orange-200 transition-colors text-gray-800 font-medium py-2 rounded-lg">
                  Detalji
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <Link
            to="/browse-products"
            className="flex items-center gap-2 border border-orange-300 text-orange-600 font-medium px-6 py-2 rounded-full hover:bg-orange-50 transition-colors"
          >
            Vidi sve proizvode <span>→</span>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6">Rezervacije</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reservationsList.slice(0, 3).map((reservation) => (
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
                    <span className="text-blue-500">Prodavnica</span>
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

                <button className="mt-auto w-full bg-orange-100 hover:bg-orange-200 transition-colors text-gray-800 font-medium py-2 rounded-lg">
                  Detalji
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <Link
            to="/my-reservations"
            className="flex items-center gap-2 border border-orange-300 text-orange-600 font-medium px-6 py-2 rounded-full hover:bg-orange-50 transition-colors"
          >
            Vidi sve rezervacije <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RestaurantDashboardPage;
