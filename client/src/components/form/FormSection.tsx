import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface FormSectionProps {
  title: string;
  icon: LucideIcon;
  description?: string;
  children: ReactNode;
}

function FormSection({ title, icon: Icon, description, children }: FormSectionProps) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-base font-semibold leading-8 text-gray-900">{title}</h2>
          {description && <p className="-mt-1 text-sm text-gray-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default FormSection;
