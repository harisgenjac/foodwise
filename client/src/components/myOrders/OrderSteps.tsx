import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { stepHasInfo, type OrderStep, type StepTone } from "../../utils/orderSteps.js";

// Where the steps sit: "light" on a white card (My orders), "dark" on the order page's green hero
// (design/order-details/), with lime instead of green, a coral failure and a white tooltip.
export type StepsVariant = "light" | "dark";

// The colours of each variant. The dark hero's own colours have no token: the coral (#F2715C) of a
// failure, the peach (#FFB8A8) of its text, the muted green of a step ahead (#9CC9AE, lightened
// from the design's #86B79A to pass AA on brand-900) and of an empty dot (#4D8A62) and line (#2F6B45).
const THEMES = {
  light: {
    infoTitle: { default: "text-[#BEF264]", waiting: "text-warning-300", danger: "text-danger-300" },
    detail: { default: "text-neutral-600", waiting: "font-bold text-warning-800", danger: "font-bold text-danger-700" },
    failedText: "font-bold text-danger-700",
    label: {
      failed: "font-extrabold text-danger-700",
      current: "font-extrabold text-neutral-900",
      done: "font-semibold text-neutral-900",
      upcoming: "font-semibold text-neutral-500",
    },
    done: "border-brand-800 bg-brand-800 text-white",
    failed: "border-danger-700 bg-danger-700 text-white",
    ring: { border: "border-brand-800 bg-white", dot: "bg-brand-800" },
    ringDanger: { border: "border-danger-700 bg-white", dot: "bg-danger-700" },
    empty: "border-neutral-300 bg-white",
    lineDone: "bg-brand-800",
    line: "bg-neutral-200",
    seal: { done: "var(--color-brand-800)", check: "var(--color-white)", grey: "var(--color-neutral-300)", greyFill: "var(--color-white)" },
    tip: "bg-neutral-900 text-white shadow-[0_12px_32px_rgba(28,25,23,0.25)]",
    tipLine: "text-neutral-200",
    focus: "focus-visible:outline-brand-300",
  },
  dark: {
    infoTitle: { default: "text-brand-800", waiting: "text-warning-800", danger: "text-danger-700" },
    detail: { default: "text-brand-200", waiting: "font-bold text-warning-300", danger: "font-bold text-[#FFB8A8]" },
    failedText: "font-bold text-[#FFB8A8]",
    label: {
      failed: "font-extrabold text-[#FFB8A8]",
      current: "font-extrabold text-white",
      done: "font-semibold text-white",
      upcoming: "font-semibold text-[#9CC9AE]",
    },
    done: "border-lime bg-lime text-brand-900",
    failed: "border-[#F2715C] bg-[#F2715C] text-white",
    ring: { border: "border-lime bg-transparent", dot: "bg-lime" },
    ringDanger: { border: "border-[#F2715C] bg-transparent", dot: "bg-[#F2715C]" },
    empty: "border-[#4D8A62] bg-transparent",
    lineDone: "bg-lime",
    line: "bg-[#2F6B45]",
    seal: { done: "var(--color-lime)", check: "var(--color-brand-900)", grey: "#4D8A62", greyFill: "none" },
    tip: "bg-white text-neutral-700 shadow-[0_12px_32px_rgba(28,25,23,0.25)]",
    tipLine: "text-neutral-700",
    focus: "focus-visible:outline-brand-300",
  },
} as const satisfies Record<StepsVariant, unknown>;

type Theme = (typeof THEMES)[StepsVariant];

// How a step's dot looks. The step on turn is a grey dot (the line is green up to it), so nothing
// looks finished before it is; only waiting for the store's answer and a late pickup keep a ring.
type MarkerKind = "done" | "failed" | "ring" | "ringDanger" | "pending" | "upcoming";

const markerKind = (step: OrderStep): MarkerKind => {
  if (step.state !== "current") return step.state;
  if (step.tone === "danger") return "ringDanger";
  return step.tone === "waiting" && step.key === "accepted" ? "ring" : "pending";
};

// The success seal (lucide's badge-check drawn at 30 px): grey until done, then filled (green on
// white, lime on the hero).
function SuccessSeal({ state, theme }: { state: OrderStep["state"]; theme: Theme }) {
  const done = state === "done";
  const stroke = done ? theme.seal.done : theme.seal.grey;
  const fill = done ? theme.seal.done : theme.seal.greyFill;
  const check = done ? theme.seal.check : stroke;
  return (
    <svg
      aria-hidden="true"
      data-testid="success-seal"
      data-filled={done}
      viewBox="0 0 24 24"
      className="h-[30px] w-[30px]"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        fill={fill}
        stroke={stroke}
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <path d="m9 12 2 2 4-4" fill="none" stroke={check} strokeWidth="2.4" />
    </svg>
  );
}

// The round marker: a check (done), a ring with a dot (waiting for the store's answer; red for a
// late pickup), an empty ring (on turn or ahead), an X (failed), or the seal on the last step.
function StepMarker({ step, theme }: { step: OrderStep; theme: Theme }) {
  if (step.final && step.state !== "failed") {
    return (
      <span className="-my-[3px] flex h-[30px] w-[30px] shrink-0 items-center justify-center">
        <SuccessSeal state={step.state} theme={theme} />
      </span>
    );
  }
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full box-border";
  if (step.state === "done") {
    return (
      <span className={`${base} border-2 ${theme.done}`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (step.state === "failed") {
    return (
      <span className={`${base} border-2 ${theme.failed}`}>
        <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  const kind = markerKind(step);
  if (kind === "ring" || kind === "ringDanger") {
    const ring = kind === "ringDanger" ? theme.ringDanger : theme.ring;
    return (
      <span className={`${base} border-[3px] ${ring.border}`}>
        <span className={`h-2 w-2 rounded-full ${ring.dot}`} />
      </span>
    );
  }
  return <span className={`${base} border-2 ${theme.empty}`} />;
}

interface OrderStepsProps {
  steps: OrderStep[];
  // Names the list ("Tok narudžbe #K7PM").
  label: string;
  variant?: StepsVariant;
}

// The order's progress as an ordered list (design/my-orders/my-orders.html, and on the order page's
// hero design/order-details/): a row of steps joined by a line (green, or lime on the hero, up to
// the last step done), each with its label and time; below 640 px one step per line. A step the
// order has reached is a button: hover, keyboard focus or a tap shows its details in a small
// tooltip (role="tooltip", aria-describedby); Escape or a tap elsewhere hides it. Steps not reached
// have no tooltip and are not focusable.
function OrderSteps({ steps, label, variant = "light" }: OrderStepsProps) {
  const { t } = useTranslation();
  const theme = THEMES[variant];
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(null);
  // A mouse opens a tooltip on hover, so its click must not close it again; a tap toggles it.
  const lastPointer = useRef<string>("mouse");
  const listRef = useRef<HTMLOListElement>(null);

  // A tap outside the list closes an open tooltip.
  useEffect(() => {
    if (open === null) return;
    const close = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <ol ref={listRef} aria-label={label} data-variant={variant} className="m-0 flex list-none flex-col gap-0 p-0 sm:flex-row">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const hasInfo = stepHasInfo(step, index);
        const tipId = `${baseId}-tip-${index}`;
        const isOpen = open === index;
        // The line to the next step is filled once this step is done.
        const lineDone = step.state === "done" && !last;
        const stateText = t(`myOrders.stepState.${step.state}`);
        const content = (
          <>
            <span className="flex shrink-0 flex-col items-center sm:w-full sm:flex-row">
              {/* A mouse opens the info only over the dot, not over the line or the text. */}
              <span
                data-testid="step-marker"
                data-marker={markerKind(step)}
                className={`flex shrink-0 ${hasInfo ? "cursor-help" : ""}`}
                onPointerEnter={hasInfo ? (event: PointerEvent) => event.pointerType === "mouse" && setOpen(index) : undefined}
                onPointerLeave={
                  hasInfo
                    ? (event: PointerEvent) => event.pointerType === "mouse" && setOpen((current) => (current === index ? null : current))
                    : undefined
                }
              >
                <StepMarker step={step} theme={theme} />
              </span>
              {!last && (
                <span
                  data-testid="step-line"
                  data-filled={lineDone}
                  aria-hidden="true"
                  className={`my-1 w-[3px] flex-1 rounded-[3px] sm:mx-1.5 sm:my-0 sm:h-[3px] sm:w-auto ${lineDone ? theme.lineDone : theme.line}`}
                />
              )}
            </span>
            <span className={`block min-w-0 pr-2 ${last ? "" : "pb-3 sm:pb-0"}`}>
              <span data-testid="step-label" className={`block text-[13px] ${theme.label[step.state]}`}>
                {step.label}
                <span className="sr-only"> ({stateText})</span>
              </span>
              {step.detail && (
                <span
                  data-testid="step-detail"
                  className={`block text-xs font-medium ${step.state === "failed" ? theme.failedText : theme.detail[step.tone]} ${
                    variant === "dark" && step.state === "current" ? "font-bold" : ""
                  }`}
                >
                  {step.detail}
                </span>
              )}
            </span>
          </>
        );
        const layout = "flex w-full gap-3 sm:flex-col sm:gap-2";
        return (
          <li key={step.key} data-testid="order-step" data-state={step.state} className="relative min-w-0 sm:flex-1">
            {hasInfo ? (
              <button
                type="button"
                aria-describedby={tipId}
                aria-expanded={isOpen}
                onPointerDown={(event) => {
                  lastPointer.current = event.pointerType;
                }}
                onClick={() => {
                  const tap = lastPointer.current !== "mouse";
                  lastPointer.current = "mouse";
                  setOpen((current) => (tap && current === index ? null : index));
                }}
                onFocus={() => setOpen(index)}
                onBlur={() => setOpen((current) => (current === index ? null : current))}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && isOpen) {
                    event.stopPropagation();
                    setOpen(null);
                  }
                }}
                className={`${layout} cursor-default rounded-[10px] border-0 bg-transparent p-0 text-left text-inherit focus-visible:outline-[3px] focus-visible:outline-offset-2 ${theme.focus} min-h-11 sm:min-h-0`}
              >
                {content}
              </button>
            ) : (
              <div className={layout}>{content}</div>
            )}
            {hasInfo && step.info && (
              <div
                role="tooltip"
                id={tipId}
                hidden={!isOpen}
                className={`absolute top-full z-20 mt-2 w-[min(260px,calc(100vw-48px))] rounded-xl px-3.5 py-3 text-[13px] leading-[1.45] ${theme.tip} left-9 sm:left-0 ${
                  index >= steps.length - 2 && steps.length > 2 ? "sm:right-0 sm:left-auto" : ""
                }`}
              >
                <div className={`mb-1 font-extrabold ${theme.infoTitle[step.info.tone]}`}>{step.info.title}</div>
                {step.info.lines.map((line) => (
                  <div key={line} className={theme.tipLine}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default OrderSteps;
