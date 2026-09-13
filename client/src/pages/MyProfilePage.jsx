import { useState, useEffect } from "react";
import api from "../api/axios.js";
import toast from "react-hot-toast";

function MyProfilePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [pickupHours, setPickupHours] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchProfile = async () => {
    try {
      const response = await api.get("/users/me");
      const data = response.data.user;
      setEmail(data.email);
      setRole(data.role);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setBusinessName(data.business_name);
      setCity(data.city);
      setPhone(data.phone);
      setAddress(data.address);
      setOpeningHours(data.opening_hours);
      setPickupHours(data.pickup_hours);
      setDescription(data.description);
    } catch (err) {
      console.error("Error fetching user:", err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await api.put("/users/me", {
        first_name: firstName,
        last_name: lastName,
        business_name: businessName,
        city,
        phone,
        address,
        opening_hours: openingHours,
        pickup_hours: pickupHours,
        description,
      });
      toast.success(response.data.message);
      setSuccess("Profil uspješno ažuriran.");
      setError("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Error updating user:", err);
      toast.error(err.response?.data?.error || "Greška prilikom akcije.");
      setError("Greška prilikom ažuriranja profila.");
      setSuccess("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const inputStyle =
    "w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-2xl font-bold mb-6">Uredi profil</h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {success}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed"
          />
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Uloga
          </label>
          <input
            type="text"
            value={role === "STORE" ? "Prodavnica" : "Restoran"}
            disabled
            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed"
          />
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ime *
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prezime *
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ime prodavnice/restorana *
          </label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Grad *
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Broj telefona *
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Radno vrijeme
          </label>
          <input
            type="text"
            value={openingHours}
            onChange={(e) => setOpeningHours(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Izdavanje/preuzimanje robe
          </label>
          <input
            type="text"
            value={pickupHours}
            onChange={(e) => setPickupHours(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dodatne informacije
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputStyle}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 transition-colors text-white font-medium py-2 rounded-lg"
        >
          Spremi
        </button>
      </form>
    </div>
  );
}

export default MyProfilePage;
