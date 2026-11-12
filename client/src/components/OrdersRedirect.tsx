import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

// The old reservation addresses (/reservations, /my-reservations, /reservation/:id, still in older
// emails and notifications) open the role's order list: an old reservation id is not an order id.
function OrdersRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "STORE" ? "/orders" : "/my-orders"} replace />;
}

// The admin's old reservation list (with its ?user_id= filter) is now the order list.
export function AdminOrdersRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/admin/orders${search}`} replace />;
}

export default OrdersRedirect;
