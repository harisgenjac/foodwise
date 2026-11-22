import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarX, CircleDollarSign, Package, Timer, type LucideIcon } from "lucide-react";
import { ScooterIcon } from "../dashboard/HomeIllustrations.js";
import { useCredits } from "../../context/CreditsContext.js";
import { SUBSCRIPTION_SECTION, usageBarColor, usagePercent } from "../../utils/credits.js";
import { dayAndTime } from "../../utils/storeHome.js";
import type { StoreHomeToday } from "../../types/index.js";

// The tones of the card icons (design/store-home/store.dc.html).
const TONES = {
  accent: "bg-accent-100 text-accent-700",
  brand: "bg-brand-100 text-brand-800",
  info: "bg-info-100 text-info-700",
  danger: "bg-danger-100 text-danger-700",
  soft: "bg-brand-50 text-brand-800",
} as const;

interface TodayCardProps {
  to: string;
  icon: LucideIcon | typeof ScooterIcon;
  tone: keyof typeof TONES;
  value: ReactNode;
  title: string;
  line: string;
  children?: ReactNode;
  testId: string;
}

function TodayCard({ to, icon: Icon, tone, value, title, line, children, testId }: TodayCardProps) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="flex min-h-11 flex-col gap-2.5 rounded-[18px] border border-neutral-100 bg-white p-[18px] text-neutral-900 shadow-[0_2px_10px_rgba(28,25,23,0.04)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
    >
      <span className="flex items-center justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight className="h-[18px] w-[18px] text-neutral-400" aria-hidden="true" />
      </span>
      <span data-testid="today-card-value" className="text-[34px] leading-none font-extrabold">{value}</span>
      <span className="text-[15px] font-bold">{title}</span>
      {children}
      <span
        data-testid="today-card-line"
        className="text-[13px] font-medium text-neutral-600"
      >
        {line}
      </span>
    </Link>
  );
}

// "Prva ističe za 8 min" under an hour away, otherwise "Prva ističe sutra u 12:00".
const deadlineLine = (deadline: string, now: number, t: ReturnType<typeof useTranslation>["t"], language: string) => {
  const minutes = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 60000));
  if (minutes < 60) return t("storeHome.today.pendingIn", { count: minutes });
  return t("storeHome.today.pendingAt", { time: dayAndTime(deadline, now, t, language) });
};

const timeOf = (value: string) => new Date(value).toLocaleTimeString(undefined, { timeStyle: "short", hourCycle: "h23" });

interface TodayCardsProps {
  today: StoreHomeToday | null;
}

// "Danas" on the store home page: the title with today's date and five equal link cards (one row on
// desktop, two columns on a tablet, one on a phone): orders waiting for an answer, to prepare today,
// to hand over, products expiring today, and this month's credits. Pulse cards while loading.
function TodayCards({ today }: TodayCardsProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { credits } = useCredits();
  // The deadline line counts down by itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const date = new Date(now);
  const weekdays = t("dashboard.weekdays", { returnObjects: true }) as string[];
  const months = t("dashboard.months", { returnObjects: true }) as string[];
  const dateText = t("dashboard.dateFormat", {
    weekday: weekdays[date.getDay()],
    day: date.getDate(),
    month: months[date.getMonth()],
  });

  const handOver = today ? today.hand_over_courier + today.hand_over_pickup : 0;
  const handOverParts = today
    ? [
        today.hand_over_courier > 0 && t("storeHome.today.courier", { count: today.hand_over_courier }),
        today.hand_over_pickup > 0 && t("storeHome.today.inPerson", { count: today.hand_over_pickup }),
      ].filter(Boolean)
    : [];
  const hasPlan = credits?.hasActiveSubscription === true;
  const percent = credits ? usagePercent(credits.used, credits.total) : 0;

  return (
    <section aria-labelledby={titleId} data-testid="store-today" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-[28px] font-extrabold tracking-[-0.5px]">
          {t("storeHome.today.title")}
        </h2>
        <span className="text-[15px] text-neutral-600">{dateText}</span>
      </div>
      {today === null ? (
        <div aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-[172px] animate-pulse rounded-[18px] bg-neutral-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <TodayCard
            testId="today-pending"
            to="/orders?status=Pending"
            icon={Timer}
            tone="accent"
            value={today.pending}
            title={t("storeHome.today.pending")}
            line={
              today.pending > 0 && today.first_deadline
                ? deadlineLine(today.first_deadline, now, t, i18n.language)
                : t("storeHome.today.pendingNone")
            }
          />
          <TodayCard
            testId="today-prepare"
            to="/packing"
            icon={Package}
            tone="brand"
            value={today.to_prepare}
            title={t("storeHome.today.prepare")}
            line={
              today.first_ready_at
                ? t("storeHome.today.prepareBy", { time: timeOf(today.first_ready_at) })
                : t("storeHome.today.prepareNone")
            }
          />
          <TodayCard
            testId="today-hand-over"
            to="/pickups"
            icon={ScooterIcon}
            tone="info"
            value={handOver}
            title={t("storeHome.today.handOver")}
            line={handOverParts.length > 0 ? handOverParts.join(" · ") : t("storeHome.today.handOverNone")}
          />
          <TodayCard
            testId="today-expiring"
            to="/my-products?expiry=0"
            icon={CalendarX}
            tone="danger"
            value={today.expiring_today}
            title={t("storeHome.today.expiring")}
            line={t("storeHome.today.expiringLine", { count: today.expiring_today })}
          />
          <TodayCard
            testId="today-credits"
            to={hasPlan ? "/credits" : `/my-profile#${SUBSCRIPTION_SECTION}`}
            icon={CircleDollarSign}
            tone="soft"
            value={
              hasPlan ? (
                <>
                  {credits!.available}
                  <span className="text-lg font-bold text-neutral-600"> / {credits!.total}</span>
                </>
              ) : (
                0
              )
            }
            title={t("storeHome.today.credits")}
            line={
              hasPlan
                ? t("storeHome.today.creditsLine", { count: credits!.available })
                : t("storeHome.today.noPlan")
            }
          >
            {hasPlan && (
              <span
                role="progressbar"
                aria-label={t("storeHome.today.creditsUsed")}
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-neutral-200"
              >
                <span
                  data-testid="today-credits-bar"
                  className={`block h-full rounded-full ${usageBarColor(percent)}`}
                  style={{ width: `${percent}%` }}
                />
              </span>
            )}
          </TodayCard>
        </div>
      )}
    </section>
  );
}

export default TodayCards;
