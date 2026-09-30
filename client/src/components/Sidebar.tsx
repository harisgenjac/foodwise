import { useAuth } from "../context/AuthContext.jsx";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

function Sidebar({ isSidebarOpen }: { isSidebarOpen: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const storeLinks = [
    { to: "/dashboard", label: t("sidebar.dashboard") },
    { to: "/my-profile", label: t("sidebar.myProfile") },
    { to: "/add-product", label: t("sidebar.addProduct") },
    { to: "/my-products", label: t("sidebar.myProducts") },
    { to: "/reservations", label: t("sidebar.reservations") },
    { to: "/donate-food", label: t("sidebar.donateFood") },
    { to: "/sponsor", label: t("sidebar.sponsor") },
  ];

  const restaurantLinks = [
    { to: "/dashboard", label: t("sidebar.dashboard") },
    { to: "/my-profile", label: t("sidebar.myProfile") },
    { to: "/stores", label: t("sidebar.stores") },
    { to: "/browse-products", label: t("sidebar.browseProducts") },
    { to: "/my-reservations", label: t("sidebar.myReservations") },
    { to: "/donate-food", label: t("sidebar.donateFood") },
    { to: "/sponsor", label: t("sidebar.sponsor") },
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
