import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { stepHasInfo, type OrderStep, type StepTone } from "../../utils/orderSteps.js";

// The tooltip's title colour (on neutral-900): the design's lime for a normal step (no token
// matches it), amber while waiting, red for a failure or a late pickup.
const INFO_TITLE: Record<StepTone, string> = {
  default: "text-[#BEF264]",
  waiting: "text-warning-300",
  danger: "text-danger-300",
};

const DETAIL_TONE: Record<StepTone, string> = {
  default: "text-neutral-600",
  waiting: "font-bold text-warning-800",
  danger: "font-bold text-danger-700",
};

// The success seal (lucide's badge-check drawn at 30 px): grey outline ahead, green outline when it
// is the current step, filled green when done.
function SuccessSeal({ state }: { state: OrderStep["state"] }) {
  const stroke = state === "upcoming" ? "var(--color-neutral-300)" : "var(--color-brand-800)";
  const fill = state === "done" ? "var(--color-brand-800)" : "var(--color-white)";
  const check = state === "done" ? "var(--color-white)" : stroke;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[30px] w-[30px]" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path
        fill={fill}
        stroke={stroke}
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <path d="m9 12 2 2 4-4" fill="none" stroke={check} strokeWidth="2.4" />
    </svg>
  );
}

// The round marker: a green check (done), a green ring with a dot (current; red for a late
// pickup), a grey ring (ahead), a red X (failed), or the seal on the last step.
function StepMarker({ step }: { step: OrderStep }) {
  if (step.final && step.state !== "failed") {
    return (
      <span className="-my-[3px] flex h-[30px] w-[30px] shrink-0 items-center justify-center">
        <SuccessSeal state={step.state} />
      </span>
    );
  }
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full box-border";
  if (step.state === "done") {
    return (
      <span className={`${base} border-2 border-brand-800 bg-brand-800 text-white`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (step.state === "failed") {
    return (
      <span className={`${base} border-2 border-danger-700 bg-danger-700 text-white`}>
        <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (step.state === "current") {
    const color = step.tone === "danger" ? "danger-700" : "brand-800";
    return (
      <span className={`${base} border-[3px] bg-white ${color === "danger-700" ? "border-danger-700" : "border-brand-800"}`}>
        <span className={`h-2 w-2 rounded-full ${color === "danger-700" ? "bg-danger-700" : "bg-brand-800"}`} />
      </span>
    );
  }
  return <span className={`${base} border-2 border-neutral-300 bg-white`} />;
}

interface OrderStepsProps {
  steps: OrderStep[];
  // Names the list ("Tok narudžbe #K7PM").
  label: string;
}

// The order's progress as an ordered list (design/my-orders/my-orders.html): a row of steps joined by
// a line (green up to the last step done), each with its label and time; below 640 px one step per
// line. A step the order has reached is a button: hover, keyboard focus or a tap shows its details
// in a small dark tooltip (role="tooltip", aria-describedby); Escape or a tap elsewhere hides it.
// Steps not reached have no tooltip and are not focusable.
function OrderSteps({ steps, label }: OrderStepsProps) {
  const { t } = useTranslation();
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
    <ol ref={listRef} aria-label={label} className="m-0 flex list-none flex-col gap-0 p-0 sm:flex-row">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const hasInfo = stepHasInfo(step, index);
        const tipId = `${baseId}-tip-${index}`;
        const isOpen = open === index;
        // The line to the next step is green once this step is done.
        const lineDone = step.state === "done" && !last;
        const stateText = t(`myOrders.stepState.${step.state}`);
        const content = (
          <>
            <span className="flex shrink-0 flex-col items-center sm:w-full sm:flex-row">
              <StepMarker step={step} />
              {!last && (
                <span
                  aria-hidden="true"
                  className={`my-1 w-[3px] flex-1 rounded-[3px] sm:mx-1.5 sm:my-0 sm:h-[3px] sm:w-auto ${lineDone ? "bg-brand-800" : "bg-neutral-200"}`}
                />
              )}
            </span>
            <span className={`block min-w-0 pr-2 ${last ? "" : "pb-3 sm:pb-0"}`}>
              <span
                className={`block text-[13px] ${
                  step.state === "failed"
                    ? "font-extrabold text-danger-700"
                    : step.state === "current"
                      ? "font-extrabold text-neutral-900"
                      : step.state === "done"
                        ? "font-semibold text-neutral-900"
                        : "font-semibold text-neutral-500"
                }`}
              >
                {step.label}
                <span className="sr-only"> ({stateText})</span>
              </span>
              {step.detail && (
                <span data-testid="step-detail" className={`block text-xs font-medium ${step.state === "failed" ? "font-bold text-danger-700" : DETAIL_TONE[step.tone]}`}>
                  {step.detail}
                </span>
              )}
            </span>
          </>
        );
        const layout = "flex w-full gap-3 sm:flex-col sm:gap-2";
        return (
          <li
            key={step.key}
            data-testid="order-step"
            data-state={step.state}
            className="relative min-w-0 sm:flex-1"
            onPointerEnter={hasInfo ? (event: PointerEvent) => event.pointerType === "mouse" && setOpen(index) : undefined}
            onPointerLeave={hasInfo ? (event: PointerEvent) => event.pointerType === "mouse" && setOpen((current) => (current === index ? null : current)) : undefined}
          >
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
                className={`${layout} cursor-help rounded-[10px] border-0 bg-transparent p-0 text-left text-inherit focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 min-h-11 sm:min-h-0`}
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
                className={`absolute top-full z-20 mt-2 w-[min(260px,calc(100vw-48px))] rounded-xl bg-neutral-900 px-3.5 py-3 text-[13px] leading-[1.45] text-white shadow-[0_12px_32px_rgba(28,25,23,0.25)] left-9 sm:left-0 ${
                  index >= steps.length - 2 ? "sm:right-0 sm:left-auto" : ""
                }`}
              >
                <div className={`mb-1 font-extrabold ${INFO_TITLE[step.info.tone]}`}>{step.info.title}</div>
                {step.info.lines.map((line) => (
                  <div key={line} className="text-neutral-200">
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
