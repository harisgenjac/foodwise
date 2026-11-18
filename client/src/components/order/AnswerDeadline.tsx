import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import type { Order } from "../../types/index.js";

// Under this the deadline is shown in amber.
const DEADLINE_SOON_MS = 5 * 60 * 1000;

interface AnswerDeadlineProps {
  order: Pick<Order, "status" | "auto_reject_at">;
  // The store is told when its order is rejected; everyone else until when the store can answer.
  viewer: "STORE" | "RESTAURANT" | "ADMIN";
  className?: string;
}

// When a Pending order is rejected automatically if the store does not answer (`auto_reject_at`:
// a delivery order 15 minutes after sending, a pickup order at its pickup time). The time only,
// or with the date when it is not today. Nothing for a decided order.
function AnswerDeadline({ order, viewer, className = "" }: AnswerDeadlineProps) {
  const { t } = useTranslation();
  // Re-rendered every 30 s, so the amber state comes on by itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(intervalId);
  }, []);
  if (order.status !== "Pending" || !order.auto_reject_at) return null;

  const deadline = new Date(order.auto_reject_at);
  const today = new Date(now).toDateString() === deadline.toDateString();
  const time = deadline.toLocaleString(
    undefined,
    today ? { timeStyle: "short", hourCycle: "h23" } : { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" },
  );
  const soon = deadline.getTime() - now < DEADLINE_SOON_MS;
  return (
    <p
      data-testid="answer-deadline"
      className={`flex items-center gap-1.5 text-sm font-medium ${soon ? "text-amber-700" : "text-gray-600"} ${className}`}
    >
      <Timer className="h-4 w-4 shrink-0" />
      {t(viewer === "STORE" ? "orders.autoReject.storeDeadline" : "orders.autoReject.deadline", { time })}
    </p>
  );
}

export default AnswerDeadline;
