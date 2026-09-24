import { useState, useEffect } from "react";
import api from "../api/axios.js";
import type { User } from "../types/index.js";
import axios from "axios";

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
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchProfile = async () => {
    try {
      const response = await api.get("/users/me");
      const data: User = response.data.user;
      setEmail(data.email);
      setRole(data.role);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setBusinessName(data.business_name || "");
      setCity(data.city || "");
      setPhone(data.phone || "");
      setAddress(data.address || "");
      setOpeningHours(data.opening_hours || "");
      setPickupHours(data.pickup_hours || "");
      setDescription(data.description || "");
      setLogoUrl(data.logo_url || "");
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    const formData = new FormData();
    formData.append("logo", logoFile);

    try {
      const response = await api.post("/users/me/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoUrl(response.data.logo_url);
      setLogoFile(null);
      setSuccess("Slika uspješno postavljena.");
      setError("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null
      setError(message || "Greška prilikom uploada slike.");
      setSuccess("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await api.put("/users/me", {
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
      setSuccess("Profil uspješno ažuriran.");
      setError("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Error updating user:", err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null
      setError(
        message || "Greška prilikom ažuriranja profila.",
      );
      setSuccess("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const inputStyle =
    "w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelStyle = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <h1 className="text-2xl font-bold mb-6">Moj profil</h1>

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

      <div className="bg-white rounded-2xl shadow p-6 md:p-8">
        <div className="flex items-start gap-6 mb-8 pb-8 border-b border-gray-100">
          <label className="relative shrink-0 w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 hover:border-orange-400 transition-colors cursor-pointer overflow-hidden bg-gray-50 flex items-center justify-center">
            {logoPreview || logoUrl ? (
              <img
                src={logoPreview || `http://localhost:3000${logoUrl}`}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-s text-gray-400 text-center px-2">
                📷
                <br />
                Dodaj logo
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
          </label>

          <div className="flex items-center gap-2">
            <span className="group relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-gray-100 text-xs font-bold cursor-help">
              i
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-56 rounded-lg bg-gray-800 text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                Kvadratna slika, minimalno 200x200px. JPEG, PNG ili WEBP, do
                5MB.
              </span>
            </span>

            {logoFile && (
              <button
                type="button"
                onClick={handleLogoUpload}
                className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                Sačuvaj sliku
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className={labelStyle}>Uloga</label>
              <input
                type="text"
                value={role === "STORE" ? "Prodavnica" : "Restoran"}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className={labelStyle}>Ime</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>Prezime</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>Naziv biznisa</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className={inputStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>Grad</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>Telefon</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>Adresa</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>Radno vrijeme</label>
              <input
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                className={inputStyle}
              />
            </div>
            <div>
              <label className={labelStyle}>Vrijeme preuzimanja</label>
              <input
                type="text"
                value={pickupHours}
                onChange={(e) => setPickupHours(e.target.value)}
                className={inputStyle}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className={labelStyle}>Opis</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 transition-colors text-white font-medium px-8 py-2 rounded-lg"
          >
            Sačuvaj
          </button>
        </form>
      </div>
    </div>
  );
}

export default MyProfilePage;
