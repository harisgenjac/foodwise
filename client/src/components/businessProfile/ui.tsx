import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Info, type LucideIcon } from "lucide-react";

// The building blocks of the restaurant and store My profile page (design/profile/).

interface ProfileSectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  // A section with an error after a save shows a red frame.
  invalid?: boolean;
  children: ReactNode;
}

// One accordion card: the header is a single button (icon, title, description, round chevron)
// that opens and closes the body. The body stays in the DOM while closed (hidden), so a save can
// still read and focus its fields once it opens the section.
export function ProfileSection({ id, icon: Icon, title, description, open, onToggle, invalid = false, children }: ProfileSectionProps) {
  const bodyId = `${id}-body`;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-testid={`profile-section-${id}`}
      className={`scroll-mt-6 overflow-hidden rounded-[20px] border bg-white shadow-[0_2px_10px_rgba(28,25,23,0.04)] ${
        invalid ? "border-danger-300" : "border-neutral-100"
      }`}
    >
      <h2 id={`${id}-title`} className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-800 sm:px-5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
            <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-extrabold text-neutral-900">{title}</span>
            <span className="block text-sm text-neutral-600">{description}</span>
          </span>
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700"
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="border-t border-neutral-100 px-4 py-5 sm:px-5">
        {children}
      </div>
    </section>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  // Shows the label next to the switch; otherwise it only names it.
  showLabel?: boolean;
  disabled?: boolean;
  testId?: string;
}

// A green on/off switch (role="switch"), 44 px tall to tap.
export function Switch({ checked, onChange, label, showLabel = false, disabled = false, testId }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
          checked ? "bg-brand-800" : "bg-neutral-300"
        }`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </span>
      {showLabel && <span className="text-sm font-semibold text-neutral-900">{label}</span>}
    </button>
  );
}

// An info button with a small dark tooltip: opens on hover, focus and click (a tap), closes on
// Escape, mouse leave and blur.
export function HintTip({ text, label }: { text: string; label: string }) {
  const tipId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={tipId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="relative flex h-6 w-6 cursor-help items-center justify-center rounded-full text-neutral-600 after:absolute after:-inset-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-brand-800"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={tipId}
        role="tooltip"
        data-open={open}
        className={`absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-[min(280px,80vw)] -translate-x-1/2 rounded-[10px] bg-neutral-900 px-3 py-2 text-[13px] leading-[1.45] font-medium text-white transition-opacity ${
          open ? "opacity-100" : "invisible opacity-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

// A small rounded status chip.
export function Chip({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  const tones = {
    success: "bg-success-100 text-success-800",
    warning: "bg-warning-100 text-warning-800",
    danger: "bg-danger-100 text-danger-700",
    neutral: "bg-neutral-100 text-neutral-700",
  } as const;
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

// A section's own error (a server message for the whole section).
export function SectionError({ message }: { message: string | undefined }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <p role="alert" data-invalid className="mb-4 rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
      {t(message)}
    </p>
  );
}
