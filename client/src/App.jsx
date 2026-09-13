import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicRoute from './components/PublicRoute.jsx';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AddProductPage from './pages/AddProductPage.jsx';
import MyProductsPage from './pages/MyProductsPage.jsx';
import EditProductPage from './pages/EditProductPage.jsx';
import ReservationsPage from './pages/ReservationsPage.jsx'
import BrowseProductsPage from './pages/BrowseProductsPage.jsx';
import MyReservationsPage from './pages/MyReservationsPage.jsx';
import MyProfilePage from './pages/MyProfilePage.jsx'
import DonateFoodPage from './pages/DonateFoodPage.jsx';
import SponsorPage from './pages/SponsorPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/add-product" element={<AddProductPage />} />
        <Route path="/my-products" element={<MyProductsPage />} />
        <Route path="/edit-product/:id" element={<EditProductPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/browse-products" element={<BrowseProductsPage />} />
        <Route path="/my-reservations" element={<MyReservationsPage />} />
        <Route path="/my-profile" element={<MyProfilePage />} />
        <Route path="/donate-food" element={<DonateFoodPage />} />
        <Route path="/sponsor" element={<SponsorPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;