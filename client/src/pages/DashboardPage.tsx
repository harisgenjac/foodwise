import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import StoreDashboardPage from './StoreDashboardPage.js';
import RestaurantDashboardPage from './RestaurantDashboardPage.js';
import CompanyOverviewPage from './company/CompanyOverviewPage.js';

function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'STORE') {
    return <StoreDashboardPage />;
  }

  if (user?.role === 'RESTAURANT') {
    return <RestaurantDashboardPage />;
  }

  if (user?.role === 'COMPANY') {
    return <CompanyOverviewPage />;
  }

  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  return null;
}

export default DashboardPage;