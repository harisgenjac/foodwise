import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios.js";
import type { User } from '../types/index.js';


interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get("/users/me");
        setUser(response.data.user);
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // An expired or invalid session cookie makes every request fail with 401: drop the user so
  // ProtectedRoute sends them to the login page instead of leaving a broken, "logged in" UI.
  // A failed login also answers 400/401 but must not clear anything, so /auth/login is skipped.
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 && error.config?.url !== "/auth/login") {
          setUser(null);
        }
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(interceptorId);
  }, []);

  // The login response carries only the basic fields; /users/me returns the full profile
  // (business_name, city, logo...), so load it right away instead of waiting for a reload.
  const refreshUser = async () => {
    const response = await api.get("/users/me");
    setUser(response.data.user);
  };

  const login = async (email: string, password: string) => {
    const response = await api.post("/auth/login", { email, password });
    setUser(response.data.user);
    try {
      await refreshUser();
    } catch (error) {
      console.error("Error loading user profile:", error);
    }
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth mora biti korišten unutar AuthProvider-a.");
  }
  return context;
};
