import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// Shared behaviour of everything that opens over the page (Modal, MobileDrawer): Escape closes only
// the top one, the page underneath does not scroll, Tab stays inside and focus returns to the
// opener, and the browser's Back (the Android back button or gesture) closes it instead of leaving
// the page.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OpenOverlay {
  id: number;
  close: () => void;
}

// The open overlays, oldest first. Only the last one reacts to Escape.
const stack: OpenOverlay[] = [];
let nextId = 1;
let lockCount = 0;
let overflowBeforeLock = "";

// Back closes overlays: each open overlay has a history entry for the same page (history.state
// carries how many overlays it belongs to), and Back pops the top one. Closing an overlay any other
// way (Escape, a button, the backdrop) goes back over its entry, so the next Back leaves the page.
const DEPTH_KEY = "overlayDepth";
// Backs started here to remove entries; their popstate closes nothing.
let ownBacks = 0;
let reconcileScheduled = false;
let popListening = false;

const historyDepth = (): number => {
  const state = window.history.state as Record<string, unknown> | null;
  const depth = state?.[DEPTH_KEY];
  return typeof depth === "number" ? depth : 0;
};

// Makes the history entries match the open overlays: adds the missing ones, goes back over the
// extra ones. Waits while one of its own Backs is on the way (history.go is asynchronous), and runs
// again when it has landed.
const reconcileHistory = () => {
  if (ownBacks > 0) return;
  const depth = historyDepth();
  if (depth < stack.length) {
    for (let next = depth + 1; next <= stack.length; next++) {
      window.history.pushState({ ...(window.history.state as object | null), [DEPTH_KEY]: next }, "");
    }
  } else if (depth > stack.length) {
    ownBacks++;
    window.history.go(stack.length - depth);
  }
};

// Deferred, so overlays that close together go back once, and an overlay that closes and opens
// again at once (React StrictMode, or one dialog replacing another) keeps the entry.
const scheduleReconcile = () => {
  if (reconcileScheduled) return;
  reconcileScheduled = true;
  setTimeout(() => {
    reconcileScheduled = false;
    reconcileHistory();
  }, 0);
};

const onPopState = () => {
  if (ownBacks > 0) {
    ownBacks--;
    reconcileHistory();
    return;
  }
  // Back (or Forward to an entry without overlays): close every overlay above the entry now shown.
  for (const overlay of stack.slice(historyDepth()).reverse()) overlay.close();
  // Back can also land on an entry left by an overlay that closed by navigating (a link inside a
  // dialog, or a page change after saving): it shows the same page again, so it is skipped.
  scheduleReconcile();
};

interface OverlayOptions {
  onClose: () => void;
  // The element that holds the overlay's content: Tab stays inside it, and it takes focus on open
  // when nothing inside has (autoFocus). It needs tabIndex={-1}.
  containerRef: RefObject<HTMLElement | null>;
}

export function useOverlay({ onClose, containerRef }: OverlayOptions) {
  // The element focused before the overlay rendered, read during the first render, before an
  // autoFocus inside the overlay moves focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const id = nextId++;
    stack.push({ id, close: () => onCloseRef.current() });
    const isTop = () => stack[stack.length - 1]?.id === id;

    // Counted, so a dialog closing over the open drawer does not unlock the page.
    const root = document.documentElement;
    if (lockCount++ === 0) {
      overflowBeforeLock = root.style.overflow;
      root.style.overflow = "hidden";
    }

    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) container.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      const box = containerRef.current;
      if (!isTop() || !box) return;
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        e.preventDefault();
      } else if (e.shiftKey && (active === first || active === box || !box.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !box.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // Stays registered: a Back started here may still land after the last overlay closed.
    if (!popListening) {
      popListening = true;
      window.addEventListener("popstate", onPopState);
    }
    reconcileHistory();

    return () => {
      stack.splice(
        stack.findIndex((overlay) => overlay.id === id),
        1,
      );
      document.removeEventListener("keydown", onKeyDown);
      scheduleReconcile();
      if (--lockCount === 0) root.style.overflow = overflowBeforeLock;
      // Deferred for the same StrictMode remount: focus goes back only once the overlay is gone.
      setTimeout(() => {
        if (!containerRef.current?.isConnected && opener?.isConnected) opener.focus();
      }, 0);
    };
  }, [containerRef, opener]);
}

// The part of the page the user can see: with the keyboard open it is shorter than 100dvh (iOS
// and Android keep dvh at the full height), and on iOS it can be scrolled down. null where the
// browser has no visualViewport, and the overlay falls back to the full dvh.
export function useVisibleViewport(): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(() => {
    const viewport = window.visualViewport;
    return viewport ? { top: viewport.offsetTop, height: viewport.height } : null;
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setBox({ top: viewport.offsetTop, height: viewport.height });
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return box;
}
