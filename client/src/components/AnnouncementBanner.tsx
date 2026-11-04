import { useEffect, useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ChevronDown, Megaphone, X } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import type { Announcement } from "../types/index.js";

// Active platform announcements for stores and restaurants, in the interface language (English
// falls back to Bosnian). Dismissing hides one for this user only.
function AnnouncementBanner() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // A company headquarters gets the store announcements too.
  const isBusiness = user?.role === "STORE" || user?.role === "RESTAURANT" || user?.role === "COMPANY";

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
    <div className="mx-auto mb-3 max-w-5xl space-y-2 sm:mb-6 sm:space-y-3">
      {announcements.map((announcement) => {
        const useEnglish = english && announcement.title_en && announcement.body_en;
        return (
          <AnnouncementItem
            key={announcement.id}
            title={(useEnglish ? announcement.title_en : announcement.title_bs) ?? ""}
            body={(useEnglish ? announcement.body_en : announcement.body_bs) ?? ""}
            onDismiss={() => dismiss(announcement.id)}
          />
        );
      })}
    </div>
  );
}

// Below sm it is compact: no icon, the label only for screen readers, the title on one line and
// the text cut to two lines, with a "Show all" chevron next to the close button when it is longer.
// From sm up it shows everything.
function AnnouncementItem({ title, body, onDismiss }: { title: string; body: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);

  // Whether the two-line clamp hides part of the text (only below sm, where the clamp applies).
  useLayoutEffect(() => {
    const measure = () => {
      const el = bodyRef.current;
      if (el && !expanded) setCut(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [body, expanded]);

  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2.5 sm:p-4">
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm sm:flex">
        <Megaphone className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="sr-only text-xs font-semibold uppercase tracking-wider text-blue-600 sm:not-sr-only">
          {t("announcements.label")}
        </p>
        <p className="flex items-center gap-1.5 font-semibold text-blue-950 sm:mt-0.5 sm:block">
          <Megaphone className="h-4 w-4 shrink-0 text-blue-600 sm:hidden" strokeWidth={1.8} aria-hidden="true" />
          <span className="truncate sm:whitespace-normal">{title}</span>
        </p>
        <p
          ref={bodyRef}
          className={`mt-0.5 whitespace-pre-line text-sm text-blue-900 ${expanded ? "" : "line-clamp-2 sm:line-clamp-none"}`}
        >
          {body}
        </p>
      </div>
      <div className="-mr-1.5 -mt-1.5 flex shrink-0 sm:m-0">
        {(cut || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-label={t(expanded ? "announcements.showLess" : "announcements.showMore")}
            title={t(expanded ? "announcements.showLess" : "announcements.showMore")}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700 sm:hidden"
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("announcements.dismiss")}
          title={t("announcements.dismiss")}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700 sm:h-auto sm:w-auto sm:p-1.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default AnnouncementBanner;
