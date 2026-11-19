import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// A pointer that moves more than this many px is a drag: the click that ends it opens nothing.
export const DRAG_THRESHOLD = 5;
// The arrows scroll by about two items.
const ITEMS_PER_STEP = 2;
// An arrow shows only when the track can move more than this many px that way.
const EDGE_TOLERANCE = 4;

interface DragCarouselProps {
  // The items, each an <li> (with `snap-start` and a fixed width).
  children: ReactNode;
  // Names of the previous/next buttons.
  previousLabel: string;
  nextLabel: string;
  // Vertical position of the round arrows, e.g. "top-[70px]" for the middle of the cards' covers.
  arrowPositionClassName?: string;
  // Space between items, e.g. "gap-4".
  gapClassName?: string;
  // aria-busy while the items are skeletons.
  busy?: boolean;
  trackTestId?: string;
}

// A horizontal track of items (no library): native swipe with scroll snap on touch screens,
// trackpad and shift+wheel as usual, mouse drag (grab cursor, the track follows the pointer, snap
// off during the drag and the track settling on the nearest item after it; a drag does not open
// the item under the pointer), round floating previous/next buttons from md up (each hidden when
// the track cannot scroll that way), focused items scrolled into view, no visible scrollbar.
function DragCarousel({
  children,
  previousLabel,
  nextLabel,
  arrowPositionClassName = "top-1/2 -translate-y-1/2",
  gapClassName = "gap-4",
  busy = false,
  trackTestId,
}: DragCarouselProps) {
  const trackId = useId();
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });
  const [dragging, setDragging] = useState(false);
  // The current mouse press: where it started, and whether it has become a drag.
  const press = useRef<{ pointerId: number; startX: number; startScroll: number; dragged: boolean } | null>(null);
  // Set when a drag ends, so the click that follows it is swallowed.
  const suppressClick = useRef(false);

  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScroll({
      back: track.scrollLeft > EDGE_TOLERANCE,
      forward: track.scrollLeft + track.clientWidth < track.scrollWidth - EDGE_TOLERANCE,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(track);
    return () => observer.disconnect();
  }, [children, updateArrows]);

  // One step: an item's width plus the gap.
  const itemStep = (track: HTMLUListElement) => {
    const item = track.firstElementChild;
    if (!item) return 0;
    return item.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0);
  };

  const scrollByItems = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * ITEMS_PER_STEP * itemStep(track), behavior: "smooth" });
  };

  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    // Touch and pen keep the native swipe; only the main mouse button drags.
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    // A drag that ended without a click must not swallow this press's click.
    suppressClick.current = false;
    press.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: event.currentTarget.scrollLeft,
      dragged: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    if (!current.dragged) {
      if (Math.abs(dx) <= DRAG_THRESHOLD) return;
      // Capture only once it is a drag, so a plain click still lands on the link under it.
      current.dragged = true;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    event.currentTarget.scrollLeft = current.startScroll - dx;
  };

  const endPress = (event: PointerEvent<HTMLUListElement>) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.dragged) return;
    suppressClick.current = true;
    setDragging(false);
    // Settle on the nearest item, as scroll snap would.
    const track = event.currentTarget;
    const step = itemStep(track);
    if (step > 0) track.scrollTo({ left: Math.round(track.scrollLeft / step) * step, behavior: "smooth" });
  };

  // The click at the end of a drag opens nothing (capture phase, before the item's link sees it).
  const onClickCapture = (event: MouseEvent<HTMLUListElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // Keyboard focus brings the item fully into view inside the track.
  const onFocusCapture = (event: FocusEvent<HTMLUListElement>) => {
    if (event.target instanceof HTMLElement && event.target !== event.currentTarget) {
      event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  };

  const arrow = `absolute z-10 hidden h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-lime text-brand-900 shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 md:flex ${arrowPositionClassName}`;

  return (
    // From md up the track leaves 28 px on each side for the arrows on the edges.
    <div className="relative md:px-7">
      <button
        type="button"
        aria-label={previousLabel}
        aria-controls={trackId}
        hidden={!canScroll.back}
        onClick={() => scrollByItems(-1)}
        className={`${arrow} left-0`}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        aria-controls={trackId}
        hidden={!canScroll.forward}
        onClick={() => scrollByItems(1)}
        className={`${arrow} right-0`}
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
      </button>

      <ul
        id={trackId}
        ref={trackRef}
        aria-busy={busy || undefined}
        data-testid={trackTestId}
        data-dragging={dragging || undefined}
        onScroll={updateArrows}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onClickCapture={onClickCapture}
        onFocusCapture={onFocusCapture}
        // Images and links are not natively draggable inside the track.
        onDragStart={(event) => event.preventDefault()}
        className={`flex scroll-px-0.5 overflow-x-auto px-0.5 pt-1 pb-3 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${gapClassName} ${
          dragging ? "cursor-grabbing snap-none" : "cursor-grab snap-x snap-mandatory"
        }`}
      >
        {children}
      </ul>
    </div>
  );
}

export default DragCarousel;
