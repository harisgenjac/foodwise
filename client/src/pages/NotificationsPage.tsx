import LoadingSpinner from "../components/LoadingSpinner.jsx";
import { useNotifications } from "../hooks/useNotifications.js";
import type { Notification } from "../hooks/useNotifications.js";

function NotificationsPage() {
  const { notifications, markAsRead, loading } = useNotifications();

  const handleNotificationClick = async (notification: Notification) => {
    markAsRead(notification);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold mb-6">Notifikacije</h2>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mb-4">
            🔔
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            Nemate notifikacija
          </h3>
          <p className="text-gray-500">
            Ovdje će se pojaviti obavijesti o vašim rezervacijama i proizvodima.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`text-left p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors ${
                !notif.is_read ? "bg-orange-50 border-orange-200" : "bg-white"
              }`}
            >
              <p className="text-sm text-gray-700">{notif.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(notif.created_at).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
