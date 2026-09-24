import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function PublicRoute({ children }: { children: React.ReactNode}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p>Učitavanje...</p>;
  }

  if (user) {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

export default PublicRoute;