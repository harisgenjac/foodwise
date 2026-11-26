import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "./LoadingSpinner.js";
import type { Role } from "../types/index.js";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // When set, users with another role are sent to their dashboard, or to the page redirectTo
  // names for their role.
  role?: Role | Role[];
  redirectTo?: Partial<Record<Role, string>>;
}

function ProtectedRoute({ children, role, redirectTo }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (role && !(Array.isArray(role) ? role : [role]).includes(user.role)) {
    return <Navigate to={redirectTo?.[user.role] ?? "/dashboard"} replace />;
  }

  return children;
}

export default ProtectedRoute;
