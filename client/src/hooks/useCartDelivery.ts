import { useCallback, useEffect, useState } from "react";
import api from "../api/axios.js";
import type { CartDelivery } from "../types/index.js";

// The cart's delivery option (GET /cart/delivery): asked while the restaurant has chosen delivery,
// again whenever the cart's store or total changes. `key` is what should trigger a new quote.
export function useCartDelivery(enabled: boolean, key: string) {
  const [delivery, setDelivery] = useState<CartDelivery | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    api
      .get("/cart/delivery")
      .then((response) => {
        if (!active) return;
        setDelivery(response.data.delivery);
        setFailed(false);
      })
      .catch((err) => {
        console.error("Error checking delivery:", err);
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, key]);

  // Sending found delivery no longer possible (409 DELIVERY_UNAVAILABLE): show why.
  const markUnavailable = useCallback((reason: CartDelivery["reason"]) => {
    setDelivery({ available: false, reason });
  }, []);

  return { delivery: enabled ? delivery : null, loading: enabled && loading, failed: enabled && failed, markUnavailable };
}
