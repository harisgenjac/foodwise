import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import StoreAvatar from "../store/StoreAvatar.js";
import OrderSteps from "../myOrders/OrderSteps.js";
import { OrderStatusPill } from "../storePage/StoreOrdersTab.js";
import { formatOrderCode } from "../../utils/orders.js";
import { storeTone } from "../../utils/storeTone.js";
import { listOrder, type Headline, type HeadlineTone } from "../../utils/orderPage.js";
import type { OrderStep } from "../../utils/orderSteps.js";
import type { OrderDetails } from "../../types/index.js";

// The sentence's colour: white, yellow while waiting for the store, lime once done; a failure stays
// white (the coral "!" in front of it says it failed).
const TITLE_COLOUR: Record<HeadlineTone, string> = {
  default: "text-white",
  waiting: "text-warning-300",
  done: "text-lime",
  failure: "text-white",
};

interface OrderHeroProps {
  order: OrderDetails;
  headline: Headline;
  steps: OrderStep[];
  // The restaurant's actions (cancel while pending; pick up or cancel after a failed delivery).
  actions?: ReactNode;
}

// The order page's dark green card (design/order-details/): the store's logo or initials, "Narudžba
// #PA5U" and the status pill; the big status sentence with one line under it; the steps (the dark
// variant of My orders' OrderSteps); the actions.
function OrderHero({ order, headline, steps, actions }: OrderHeroProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const code = formatOrderCode(order.code);
  const tone = storeTone(order.store_id);
  const failure = headline.tone === "failure";

  return (
    <section
      aria-labelledby={titleId}
      data-testid="order-hero"
      className="flex flex-col gap-6 rounded-3xl bg-brand-900 px-5 py-6 text-white sm:px-8 sm:py-7"
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <StoreAvatar
          store={{ business_name: order.store.business_name ?? "", logo_url: order.store.logo_url ?? undefined }}
          decorative
          frameClassName="border-2 border-[#4D8A62] font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-12 w-12 rounded-[14px] text-base"
        />
        <p className="min-w-0 flex-[1_1_200px] text-lg font-extrabold">{t("orders.title", { code })}</p>
        <OrderStatusPill order={listOrder(order)} />
      </div>

      <div>
        <h1
          id={titleId}
          data-testid="hero-title"
          data-tone={headline.tone}
          className={`flex items-center gap-3.5 text-[28px] leading-tight font-extrabold tracking-[-0.02em] sm:text-4xl ${TITLE_COLOUR[headline.tone]}`}
        >
          {failure && (
            <span
              aria-hidden="true"
              data-testid="hero-alert"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2715C] text-xl font-extrabold text-white shadow-[0_0_0_6px_rgba(242,113,92,0.22)]"
            >
              !
            </span>
          )}
          <span className="min-w-0">{headline.title}</span>
        </h1>
        {headline.line && (
          <p data-testid="hero-line" className={`mt-1.5 text-base ${failure ? "text-[#FFD6CC]" : "text-brand-100"}`}>
            {headline.line}
          </p>
        )}
      </div>

      <OrderSteps steps={steps} label={t("myOrders.steps.label", { code })} variant="dark" />

      {actions}
    </section>
  );
}

export default OrderHero;
