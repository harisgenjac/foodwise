import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Megaphone, X } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import type { Announcement } from "../types/index.js";

// Active platform announcements for stores and restaurants, in the interface language (English
// falls back to Bosnian). Dismissing hides one for this user only.
function AnnouncementBanner() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const isBusiness = user?.role === "STORE" || user?.role === "RESTAURANT";

  useEffect(() => {
    if (!isBusiness) return;
    api
      .get("/announcements/active")
      .then((response) => setAnnouncements(response.data.announcements))
      .catch((err) => console.error("Error loading announcements:", err));
  }, [isBusiness]);

  const dismiss = (id: number) => {
    setAnnouncements((current) => current.filter((announcement) => announcement.id !== id));
    // It stays hidden for now; without the server's record it comes back on the next load.
    api.post(`/announcements/${id}/dismiss`).catch((err) => {
      console.error("Error dismissing announcement:", err);
      toast.error(t("announcements.dismissError"));
    });
  };

  if (!isBusiness || announcements.length === 0) return null;

  const english = i18n.language === "en";

  return (
    <div className="mx-auto mb-6 max-w-5xl space-y-3">
      {announcements.map((announcement) => {
        const useEnglish = english && announcement.title_en && announcement.body_en;
        const title = useEnglish ? announcement.title_en : announcement.title_bs;
        const body = useEnglish ? announcement.body_en : announcement.body_bs;
        return (
          <div
            key={announcement.id}
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
              <Megaphone className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{t("announcements.label")}</p>
              <p className="mt-0.5 font-semibold text-blue-950">{title}</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-blue-900">{body}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(announcement.id)}
              aria-label={t("announcements.dismiss")}
              title={t("announcements.dismiss")}
              className="cursor-pointer rounded-lg p-1.5 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default AnnouncementBanner;
