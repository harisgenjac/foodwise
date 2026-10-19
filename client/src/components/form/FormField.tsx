import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Shared input look. Pair it with FormField, which adds the leading icon (pl-10 leaves room for it).
export const inputStyle =
  "w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

interface FormFieldProps {
  label: string;
  icon: LucideIcon;
  suffix?: string;
  children: ReactNode;
}

function FormField({ label, icon: Icon, suffix, children }: FormFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      <span className="relative block">
        <Icon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" strokeWidth={1.8} />
        {children}
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-2.5 text-sm font-medium text-gray-400">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

export default FormField;
