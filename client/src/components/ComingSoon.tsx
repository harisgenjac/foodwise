import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  // What the feature will offer, shown as a short list.
  highlights: string[];
}

// Placeholder for planned features (the humanitarian module).
function ComingSoon({ icon: Icon, title, description, highlights }: ComingSoonProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <section className="relative overflow-hidden rounded-2xl border border-orange-100 bg-linear-to-br from-orange-50 via-amber-50/60 to-white p-8 text-center shadow-sm md:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-amber-200/30 blur-3xl" />

        <div className="relative flex flex-col items-center">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-md">
            <Icon className="h-8 w-8" strokeWidth={1.8} />
          </span>
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-orange-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            {t("comingSoon.badge")}
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-3 max-w-xl text-gray-600">{description}</p>
        </div>

        <ul className="relative mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-3">
          {highlights.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-white bg-white/80 p-4 text-sm font-medium text-gray-700 shadow-sm backdrop-blur"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default ComingSoon;
