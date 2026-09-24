import { useAuth } from '../context/AuthContext.jsx';
import StoreDashboardPage from './StoreDashboardPage.jsx';
import RestaurantDashboardPage from './RestaurantDashboardPage.jsx';

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