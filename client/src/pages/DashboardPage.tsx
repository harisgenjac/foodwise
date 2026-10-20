import { useAuth } from '../context/AuthContext.js';
import StoreDashboardPage from './StoreDashboardPage.js';
import RestaurantDashboardPage from './RestaurantDashboardPage.js';

function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'STORE') {
    return <StoreDashboardPage />;
  }

  if (user?.role === 'RESTAURANT') {
    return <RestaurantDashboardPage />;
  }

  return null;
}

export default DashboardPage;