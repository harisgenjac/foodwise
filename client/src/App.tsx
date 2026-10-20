import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import PublicRoute from './components/PublicRoute.js';
import Layout from './components/Layout.js';
import DashboardPage from './pages/DashboardPage.js';
import AddProductPage from './pages/AddProductPage.js';
import MyProductsPage from './pages/MyProductsPage.js';
import ImportProductsPage from './pages/ImportProductsPage.js';
import EditProductPage from './pages/EditProductPage.js';
import ReservationsPage from './pages/ReservationsPage.js'
import BrowseProductsPage from './pages/BrowseProductsPage.js';
import StoresPage from './pages/StoresPage.js'
import StoreDetailsPage from './pages/StoreDetailsPage.js';
import MyReservationsPage from './pages/MyReservationsPage.js';
import MyProfilePage from './pages/MyProfilePage.js'
import DonateFoodPage from './pages/DonateFoodPage.js';
import SponsorPage from './pages/SponsorPage.js';
import NotificationsPage from './pages/NotificationsPage.js'
import ProductDetailsPage from "./pages/ProductDetailsPage.js"
import ReservationDetailsPage from "./pages/ReservationDetailsPage.js"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/add-product" element={<ProtectedRoute role="STORE"><AddProductPage /></ProtectedRoute>} />
        <Route path="/import-products" element={<ProtectedRoute role="STORE"><ImportProductsPage /></ProtectedRoute>} />
        <Route path="/my-products" element={<ProtectedRoute role="STORE"><MyProductsPage /></ProtectedRoute>} />
        <Route path="/edit-product/:id" element={<ProtectedRoute role="STORE"><EditProductPage /></ProtectedRoute>} />
        <Route path="/reservations" element={<ProtectedRoute role="STORE"><ReservationsPage /></ProtectedRoute>} />
        <Route path="/browse-products" element={<ProtectedRoute role="RESTAURANT"><BrowseProductsPage /></ProtectedRoute>} />
        <Route path="/stores" element={<ProtectedRoute role="RESTAURANT"><StoresPage /></ProtectedRoute>} />
        <Route path="/stores/:id" element={<ProtectedRoute role="RESTAURANT"><StoreDetailsPage /></ProtectedRoute>} />
        <Route path="/my-reservations" element={<ProtectedRoute role="RESTAURANT"><MyReservationsPage /></ProtectedRoute>} />
        <Route path="/my-profile" element={<MyProfilePage />} />
        <Route path="/donate-food" element={<DonateFoodPage />} />
        <Route path="/sponsor" element={<SponsorPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/products/:id" element={<ProductDetailsPage />} />
        <Route path="/reservation/:id" element={<ReservationDetailsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;