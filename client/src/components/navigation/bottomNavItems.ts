import { LayoutDashboard, Package, PackageCheck, ReceiptText, ShoppingBasket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BottomNavItem {
  to: string;
  // An i18n key (short labels: a bar item is about 75 px wide on a phone).
  labelKey: string;
  icon: LucideIcon;
}

export type BottomNavRole = "STORE" | "RESTAURANT";

// The phone bottom bar's pages per role, in order. BottomNav always adds "More" (the drawer) last.
// The icons match the sidebar's. Admins and company headquarters have no bottom bar.
export const BOTTOM_NAV_ITEMS: Record<BottomNavRole, BottomNavItem[]> = {
  STORE: [
    { to: "/dashboard", labelKey: "bottomNav.dashboard", icon: LayoutDashboard },
    { to: "/my-products", labelKey: "bottomNav.myProducts", icon: Package },
    { to: "/orders", labelKey: "bottomNav.orders", icon: ReceiptText },
    { to: "/pickups", labelKey: "bottomNav.pickups", icon: PackageCheck },
  ],
  RESTAURANT: [
    { to: "/dashboard", labelKey: "bottomNav.dashboard", icon: LayoutDashboard },
    { to: "/browse-products", labelKey: "bottomNav.browseProducts", icon: ShoppingBasket },
    { to: "/my-orders", labelKey: "bottomNav.orders", icon: ReceiptText },
    { to: "/pickups", labelKey: "bottomNav.pickups", icon: PackageCheck },
  ],
};

export const hasBottomNav = (role: string | undefined): role is BottomNavRole =>
  role === "STORE" || role === "RESTAURANT";
