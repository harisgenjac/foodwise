import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Info, type LucideIcon } from "lucide-react";

// Which InfoTooltip is open on the page: opening one closes any other.
let openId: string | null = null;
const listeners = new Set<() => void>();
const setOpenId = (id: string | null) => {
  openId = id;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

interface InfoTooltipProps {
  // Shown large at the top of the card.
  icon: LucideIcon;
  title: string;
  text: string;
  // The info button's accessible name, e.g. "How food saved is counted".
  label: string;
}

// An "i" button that explains a number: a dark teal card (role="tooltip", linked with
// aria-describedby) with the icon, a lime title and the text. It opens on hover and keyboard focus,
// and on tap on touch screens; a tap outside, Escape, leaving or blurring the button closes it.
// The card sits above its positioned (`relative`) ancestor, e.g. the stat it explains: centred
// over it from sm up, starting at its left edge on phones and never wider than the screen.
function InfoTooltip({ icon: Icon, title, text, label }: InfoTooltipProps) {
  const id = useId();
  const cardId = `${id}-tooltip`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = useSyncExternalStore(subscribe, () => openId === id);
  const show = () => setOpenId(id);
  const hide = () => {
    if (openId === id) setOpenId(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) setOpenId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // A tooltip left open by an unmounted page must not stay "open" for the next one.
  useEffect(() => () => {
    if (openId === id) setOpenId(null);
  }, [id]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={cardId}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={show}
        className="inline-flex cursor-help items-center justify-center rounded-full text-[#D9F99D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9F99D]"
      >
        <Info className="h-[19px] w-[19px]" aria-hidden="true" />
      </button>
      <div
        id={cardId}
        role="tooltip"
        data-open={open}
        className={`pointer-events-none absolute bottom-[calc(100%+12px)] left-0 z-20 w-[min(260px,calc(100vw-64px))] rounded-xl bg-[#064E46] px-5 pt-[18px] pb-5 text-center shadow-lg transition-opacity duration-150 sm:left-1/2 sm:w-60 sm:-translate-x-1/2 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <Icon className="mx-auto h-10 w-10 text-[#5EEAD4]" strokeWidth={1.5} aria-hidden="true" />
        <p className="mt-1.5 mb-2.5 text-[17px] font-semibold text-[#D9F99D]">{title}</p>
        <p className="text-left text-sm leading-[1.55] text-white">{text}</p>
      </div>
    </>
  );
}

export default InfoTooltip;
