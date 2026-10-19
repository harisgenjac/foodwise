import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";

function PublicRoute({ children }: { children: React.ReactNode}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (user) {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

export default PublicRoute;