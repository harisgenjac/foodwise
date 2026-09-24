import { useAuth } from "../context/AuthContext.jsx";
import { Link } from "react-router-dom";

function Sidebar({ isSidebarOpen }: { isSidebarOpen: boolean}) {
  const { user } = useAuth();

  const storeLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/my-profile", label: "Moj Profil" },
    { to: "/add-product", label: "Dodaj Proizvod" },
    { to: "/my-products", label: "Moji Proizvodi" },
    { to: "/reservations", label: "Moje Reservacije" },
    { to: "/donate-food", label: "Doniraj obrok" },
    { to: "/sponsor", label: "Budi sponzor" },
  ];

  const restaurantLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/my-profile", label: "Moj Profil" },
    { to: "/stores", label: "Prodavnice"},
    { to: "/browse-products", label: "Pretraži Proizvode" },
    { to: "/my-reservations", label: "Moje Rezervacije" },
    { to: "/donate-food", label: "Doniraj obrok" },
    { to: "/sponsor", label: "Budi sponzor" },
  ];

  const links = user?.role === "STORE" ? storeLinks : restaurantLinks;

  return (
    <aside
      className={`bg-gray-800 text-white transition-all duration-300 ${isSidebarOpen ? "w-64" : "w-16"}`}
    >
      <ul className="mt-4">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="block px-4 py-3 hover:bg-gray-700">
              {isSidebarOpen ? link.label : link.label[0]}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default Sidebar;
