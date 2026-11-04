import { useRef } from "react";
import type { ReactNode } from "react";
import { useOverlay, useVisibleViewport } from "../../hooks/useOverlay.js";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  // Id of the element that names the dialog (its title).
  labelledBy?: string;
}

// A dialog over the page. It is never taller than the visible screen (also with the keyboard open):
// built from ModalHeader, ModalBody and ModalFooter, only the body scrolls, so the title and the
// buttons stay in view. A <form> around the body and footer takes `modalFormStyle`. Escape, a
// backdrop click and Back close it; the page underneath does not scroll, Tab stays inside, and focus
// returns to the button that opened it (useOverlay).
function Modal({ onClose, children, labelledBy }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay({ onClose, containerRef: panelRef });
  const visible = useVisibleViewport();

  return (
    <div
      onClick={onClose}
      data-testid="modal-backdrop"
      style={visible ? { top: visible.top, height: visible.height, bottom: "auto" } : undefined}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white shadow-xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}

// The title row: never scrolls away.
export function ModalHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`shrink-0 px-6 pt-6 ${className}`}>{children}</div>;
}

// The content between the title and the buttons; the only part that scrolls. A soft shadow at the
// top or bottom edge shows there is more to scroll (scroll-shadows in index.css).
export function ModalBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-testid="modal-body"
      className={`scroll-shadows min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-1 pt-4 ${className}`}
    >
      {children}
    </div>
  );
}

// The action buttons: never scroll away.
export function ModalFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex shrink-0 gap-2 px-6 pb-6 pt-4 ${className}`}>{children}</div>;
}

// For a <form> holding the body and the footer, so the body can still shrink and scroll.
export const modalFormStyle = "flex min-h-0 flex-1 flex-col";

export default Modal;
