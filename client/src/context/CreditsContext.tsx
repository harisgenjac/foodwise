import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/axios.js";
import type { CreditSummary } from "../types/index.js";

interface CreditsContextValue {
  // null until loaded, for admins, and when loading failed.
  credits: CreditSummary | null;
  // When `credits` was last loaded ("Last refreshed on" on the Credits page).
  loadedAt: Date | null;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

// One shared copy of GET /credits/me for the banners, the form hints and the profile section.
// It reloads on every page change (a product or reservation just spent a credit) and when the
// window regains focus (an admin may have approved a request meanwhile).
export function CreditsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const { pathname } = useLocation();

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await api.get("/credits/me");
      setCredits(response.data.credits);
      setLoadedAt(new Date());
    } catch (err) {
      console.error("Error loading credits:", err);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCredits(null);
      return;
    }
    refresh();
  }, [enabled, pathname, refresh]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refresh]);

  return <CreditsContext.Provider value={{ credits, loadedAt, refresh }}>{children}</CreditsContext.Provider>;
}

const NO_CREDITS: CreditsContextValue = { credits: null, loadedAt: null, refresh: async () => {} };

// Outside the provider (admins, components rendered on their own in tests) there is simply no
// credit information, so hints and banners stay hidden.
export const useCredits = () => useContext(CreditsContext) ?? NO_CREDITS;
