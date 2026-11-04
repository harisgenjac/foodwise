import { useTranslation } from "react-i18next";
import SidebarNav from "./navigation/SidebarNav.js";

// The desktop rail, from md up; phones get MobileDrawer instead. It stays in view while the
// window scrolls (sticky below the h-16 header).
// `locked`: the account setup is unfinished, so no page but My profile (from the header) is reachable.
function Sidebar({ isSidebarOpen, locked = false }: { isSidebarOpen: boolean; locked?: boolean }) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t("sidebar.menu")}
      className={`sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 self-start overflow-y-auto overflow-x-hidden bg-white border-r border-gray-200 transition-all duration-300 md:block ${
        isSidebarOpen ? "w-64" : "w-20"
      } ${locked ? "pointer-events-none select-none opacity-50" : ""}`}
      aria-disabled={locked}
      inert={locked}
    >
      <SidebarNav expanded={isSidebarOpen} locked={locked} />
    </aside>
  );
}

export default Sidebar;
