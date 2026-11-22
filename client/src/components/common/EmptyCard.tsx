import type { LucideIcon } from "lucide-react";

interface EmptyCardProps {
  icon: LucideIcon;
  title: string;
  text?: string;
  // One button under the text, e.g. "Očisti filtere".
  action?: { label: string; onClick: () => void };
  testId?: string;
}

// An empty list in the redesigned pages' style (the store list and the store page): a white card
// with the icon on a soft green circle, the title, a line of text and an optional outlined button.
function EmptyCard({ icon: Icon, title, text, action, testId }: EmptyCardProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center gap-3 rounded-[20px] border border-[#EEEDEB] bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-800">
        <Icon className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h2 className="text-lg font-extrabold text-neutral-900">{title}</h2>
      {text && <p className="max-w-md text-sm leading-[1.55] text-neutral-600">{text}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 h-11 cursor-pointer rounded-full border border-brand-800 bg-white px-5 text-sm font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyCard;
