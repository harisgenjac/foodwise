import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios.js";

function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/register", {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role,
      });
      navigate("/login");
    } catch (err) {
      setError("Neuspješna registracija. Molimo pokušajte ponovo.");
    }
  };

  const inputStyle =
    "w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold mb-2 text-center">Napravite nalog</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Pridružite se FoodWise platformi
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="given-name"
            autoComplete="given-name"
            placeholder="Ime"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputStyle}
          />
          <input
            type="text"
            name="family-name"
            autoComplete="family-name"
            placeholder="Prezime"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputStyle}
          />
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputStyle}
          />
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Lozinka"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputStyle}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputStyle}
          >
            <option value="">-- Odaberite ulogu --</option>
            <option value="STORE">Prodavnica</option>
            <option value="RESTAURANT">Restoran</option>
          </select>
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 transition-colors text-white font-medium py-2 rounded-lg mt-2"
          >
            Registruj se
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          Već imate nalog?{' '}
          <Link to="/login" className="text-orange-600 font-medium hover:underline">
            Prijavite se
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;