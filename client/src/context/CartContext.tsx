import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/axios.js";
import type { Cart } from "../types/index.js";

interface CartContextValue {
  // null until loaded, for other roles, and when loading failed.
  cart: Cart | null;
  // "error" when the last load failed and nothing was loaded before.
  status: "loading" | "ready" | "error";
  // Lines in the cart (the header's badge).
  count: number;
  refresh: () => Promise<void>;
  // Every /cart call answers the whole cart; the caller hands it over here.
  setCart: (cart: Cart) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// One shared copy of the restaurant's cart (GET /cart) for the header's icon, "Add to cart" and
// the cart page. It reloads on every page change and when the window regains focus (another
// device or staff member may have changed the cart, or an order sent from it).
export function CartProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [cart, setCartState] = useState<Cart | null>(null);
  const [failed, setFailed] = useState(false);
  const setCart = useCallback((next: Cart) => {
    setCartState(next);
    setFailed(false);
  }, []);
  const { pathname } = useLocation();

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await api.get("/cart");
      setCart(response.data.cart);
    } catch (err) {
      console.error("Error loading the cart:", err);
      setFailed(true);
    }
  }, [enabled, setCart]);

  useEffect(() => {
    if (!enabled) {
      setCartState(null);
      return;
    }
    refresh();
  }, [enabled, pathname, refresh]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refresh]);

  return (
    <CartContext.Provider
      value={{ cart, status: cart ? "ready" : failed ? "error" : "loading", count: cart?.items.length ?? 0, refresh, setCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

const NO_CART: CartContextValue = { cart: null, status: "loading", count: 0, refresh: async () => {}, setCart: () => {} };

// Outside the provider (other roles, components rendered on their own in tests) there is no cart.
export const useCart = () => useContext(CartContext) ?? NO_CART;
