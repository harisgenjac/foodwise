import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";

interface DashboardHeroProps {
  title: string;
  subtitle: string;
  details?: string;
  action: { to: string; label: string; icon: LucideIcon };
}

function DashboardHero({ title, subtitle, details, action }: DashboardHeroProps) {
  const ActionIcon = action.icon;
  const { t } = useTranslation();
  // Day and month names come from the locale files: browsers lack reliable Bosnian date names.
  const now = new Date();
  const weekdays = t("dashboard.weekdays", { returnObjects: true }) as string[];
  const months = t("dashboard.months", { returnObjects: true }) as string[];
  const today = t("dashboard.dateFormat", {
    weekday: weekdays[now.getDay()],
    day: now.getDate(),
    month: months[now.getMonth()],
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-orange-100 bg-linear-to-br from-orange-50 via-amber-50/60 to-white p-6 shadow-sm md:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-40 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-orange-600/80">{today}</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">{title}</h1>
          <p className="mt-1 text-gray-600">{subtitle}</p>
          {details && (
            <p className="mt-3 inline-flex rounded-full border border-orange-100 bg-white/80 px-3 py-1 text-sm font-medium text-orange-700">
              {details}
            </p>
          )}
        </div>

        <Link
          to={action.to}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md"
        >
          <ActionIcon className="h-5 w-5" strokeWidth={1.8} />
          {action.label}
        </Link>
      </div>
    </section>
  );
}

export default DashboardHero;
