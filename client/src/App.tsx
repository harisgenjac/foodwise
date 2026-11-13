import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage.js';
import ForgotPasswordPage from './pages/ForgotPasswordPage.js';
import ResetPasswordPage from './pages/ResetPasswordPage.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import PublicRoute from './components/PublicRoute.js';
import Layout from './components/Layout.js';
import DashboardPage from './pages/DashboardPage.js';
import AddProductPage from './pages/AddProductPage.js';
import MyProductsPage from './pages/MyProductsPage.js';
import ImportProductsPage from './pages/ImportProductsPage.js';
import EditProductPage from './pages/EditProductPage.js';
import StoreOrdersPage from './pages/StoreOrdersPage.js';
import BrowseProductsPage from './pages/BrowseProductsPage.js';
import StoresPage from './pages/StoresPage.js'
import StoreDetailsPage from './pages/StoreDetailsPage.js';
import MyOrdersPage from './pages/MyOrdersPage.js';
import CartPage from './pages/CartPage.js';
import OrdersRedirect, { AdminOrdersRedirect } from './components/OrdersRedirect.js';
import MyProfilePage from './pages/MyProfilePage.js'
import DonateFoodPage from './pages/DonateFoodPage.js';
import AddDonationPage from './pages/AddDonationPage.js';
import EditDonationPage from './pages/EditDonationPage.js';
import SponsorPage from './pages/SponsorPage.js';
import NotificationsPage from './pages/NotificationsPage.js'
import ProductDetailsPage from "./pages/ProductDetailsPage.js"
import OrderDetailsPage from "./pages/OrderDetailsPage.js";
import PickupsPage from './pages/PickupsPage.js';
import ReportsPage from './pages/ReportsPage.js';
import CreditsPage from './pages/CreditsPage.js';
import AdminDashboardPage from './pages/admin/AdminDashboardPage.js';
import AdminUsersPage from './pages/admin/AdminUsersPage.js';
import AdminUserDetailsPage from './pages/admin/AdminUserDetailsPage.js';
import AdminCreateUserPage from './pages/admin/AdminCreateUserPage.js';
import AdminProductsPage from './pages/admin/AdminProductsPage.js';
import AdminDonationsPage from './pages/admin/AdminDonationsPage.js';
import AdminOrdersPage from './pages/admin/AdminOrdersPage.js';
import AdminOrderDetailsPage from './pages/admin/AdminOrderDetailsPage.js';
import AdminAnnouncementsPage from './pages/admin/AdminAnnouncementsPage.js';
import AdminActionsPage from './pages/admin/AdminActionsPage.js';
import AdminCreditsPage from './pages/admin/AdminCreditsPage.js';
import AdminCreditRequestsPage from './pages/admin/AdminCreditRequestsPage.js';
import AdminCompaniesPage from './pages/admin/AdminCompaniesPage.js';
import AdminCreateCompanyPage from './pages/admin/AdminCreateCompanyPage.js';
import AdminCompanyDetailsPage from './pages/admin/AdminCompanyDetailsPage.js';
import CompanyProfilePage from './pages/company/CompanyProfilePage.js';
import CompanyBranchesPage from './pages/company/CompanyBranchesPage.js';
import CompanyCreateBranchPage from './pages/company/CompanyCreateBranchPage.js';
import CompanyBranchDetailsPage from './pages/company/CompanyBranchDetailsPage.js';
import CompanyCreditsPage from './pages/company/CompanyCreditsPage.js';
import CompanyReportsPage from './pages/company/CompanyReportsPage.js';
import NotFoundPage from './pages/NotFoundPage.js';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        {/* The emailed link works with or without a session (the reset ends every session anyway). */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* The invitation link: the same page, worded for a first password. */}
        <Route path="/set-password" element={<ResetPasswordPage />} />
        {/* Store and restaurant accounts are created by an admin. RegisterPage stays for the planned public roles. */}
        <Route path="/register" element={<Navigate to="/login" replace state={{ registrationClosed: true }} />} />
        {/* The bare address goes to the dashboard; ProtectedRoute sends a visitor who is not logged in on to /login. */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/add-product" element={<ProtectedRoute role="STORE"><AddProductPage /></ProtectedRoute>} />
        <Route path="/import-products" element={<ProtectedRoute role="STORE"><ImportProductsPage /></ProtectedRoute>} />
        <Route path="/my-products" element={<ProtectedRoute role="STORE"><MyProductsPage /></ProtectedRoute>} />
        <Route path="/edit-product/:id" element={<ProtectedRoute role="STORE"><EditProductPage /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute role="STORE"><StoreOrdersPage /></ProtectedRoute>} />
        <Route path="/browse-products" element={<ProtectedRoute role="RESTAURANT"><BrowseProductsPage /></ProtectedRoute>} />
        <Route path="/stores" element={<ProtectedRoute role="RESTAURANT"><StoresPage /></ProtectedRoute>} />
        <Route path="/stores/:id" element={<ProtectedRoute role="RESTAURANT"><StoreDetailsPage /></ProtectedRoute>} />
        <Route path="/my-orders" element={<ProtectedRoute role="RESTAURANT"><MyOrdersPage /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute role="RESTAURANT"><CartPage /></ProtectedRoute>} />
        <Route path="/pickups" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><PickupsPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><ReportsPage /></ProtectedRoute>} />
        <Route path="/credits" element={<ProtectedRoute role="STORE"><CreditsPage /></ProtectedRoute>} />
        <Route path="/my-profile" element={<MyProfilePage />} />
        <Route path="/donate-food" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><DonateFoodPage /></ProtectedRoute>} />
        <Route path="/donate-food/new" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><AddDonationPage /></ProtectedRoute>} />
        <Route path="/donate-food/:id/edit" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><EditDonationPage /></ProtectedRoute>} />
        <Route path="/sponsor" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><SponsorPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/products/:id" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><ProductDetailsPage /></ProtectedRoute>} />
        <Route path="/orders/:id" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><OrderDetailsPage /></ProtectedRoute>} />
        {/* Old reservation links from earlier emails and notifications. */}
        <Route path="/reservations" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><OrdersRedirect /></ProtectedRoute>} />
        <Route path="/my-reservations" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><OrdersRedirect /></ProtectedRoute>} />
        <Route path="/reservation/:id" element={<ProtectedRoute role={["STORE", "RESTAURANT"]}><OrdersRedirect /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute role="ADMIN"><AdminUsersPage /></ProtectedRoute>} />
        <Route path="/admin/users/new" element={<ProtectedRoute role="ADMIN"><AdminCreateUserPage /></ProtectedRoute>} />
        <Route path="/admin/users/:id" element={<ProtectedRoute role="ADMIN"><AdminUserDetailsPage /></ProtectedRoute>} />
        <Route path="/admin/products" element={<ProtectedRoute role="ADMIN"><AdminProductsPage /></ProtectedRoute>} />
        <Route path="/admin/donations" element={<ProtectedRoute role="ADMIN"><AdminDonationsPage /></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute role="ADMIN"><AdminOrdersPage /></ProtectedRoute>} />
        <Route path="/admin/orders/:id" element={<ProtectedRoute role="ADMIN"><AdminOrderDetailsPage /></ProtectedRoute>} />
        <Route path="/admin/reservations" element={<ProtectedRoute role="ADMIN"><AdminOrdersRedirect /></ProtectedRoute>} />
        <Route path="/admin/announcements" element={<ProtectedRoute role="ADMIN"><AdminAnnouncementsPage /></ProtectedRoute>} />
        <Route path="/admin/actions" element={<ProtectedRoute role="ADMIN"><AdminActionsPage /></ProtectedRoute>} />
        <Route path="/admin/credits" element={<ProtectedRoute role="ADMIN"><AdminCreditsPage /></ProtectedRoute>} />
        <Route path="/admin/credit-requests" element={<ProtectedRoute role="ADMIN"><AdminCreditRequestsPage /></ProtectedRoute>} />
        <Route path="/admin/companies" element={<ProtectedRoute role="ADMIN"><AdminCompaniesPage /></ProtectedRoute>} />
        <Route path="/admin/companies/new" element={<ProtectedRoute role="ADMIN"><AdminCreateCompanyPage /></ProtectedRoute>} />
        <Route path="/admin/companies/:id" element={<ProtectedRoute role="ADMIN"><AdminCompanyDetailsPage /></ProtectedRoute>} />
        <Route path="/company/profile" element={<ProtectedRoute role="COMPANY"><CompanyProfilePage /></ProtectedRoute>} />
        <Route path="/company/branches" element={<ProtectedRoute role="COMPANY"><CompanyBranchesPage /></ProtectedRoute>} />
        <Route path="/company/branches/new" element={<ProtectedRoute role="COMPANY"><CompanyCreateBranchPage /></ProtectedRoute>} />
        <Route path="/company/branches/:id" element={<ProtectedRoute role="COMPANY"><CompanyBranchDetailsPage /></ProtectedRoute>} />
        <Route path="/company/credits" element={<ProtectedRoute role="COMPANY"><CompanyCreditsPage /></ProtectedRoute>} />
        <Route path="/company/reports" element={<ProtectedRoute role="COMPANY"><CompanyReportsPage /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;