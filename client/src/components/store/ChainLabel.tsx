import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";

interface ChainLabelProps {
  // The store's company (a branch's chain); nothing is shown for an independent store.
  company: string | null | undefined;
  className?: string;
}

// "dio Bingo d.o.o." / "part of Bingo d.o.o." next to a branch's name, so restaurants know the
// store belongs to a chain. The headquarters itself never appears to restaurants.
function ChainLabel({ company, className = "" }: ChainLabelProps) {
  const { t } = useTranslation();
  if (!company) return null;
  const label = t("store.chainLabel", { company });
  return (
    <span
      title={label}
      className={`inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ${className}`}
    >
      <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export default ChainLabel;
