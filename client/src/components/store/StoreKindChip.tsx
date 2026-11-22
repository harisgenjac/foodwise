import { useTranslation } from "react-i18next";
import { Building2, Store } from "lucide-react";

// Under a store's name on the store list and the store page (design/stores/): "dio Bingo d.o.o."
// in green with a building for a branch, "Samostalna prodavnica" in grey with a store otherwise, so
// every card has one chip and the cards line up. The full text is the title when it is cut.
function StoreKindChip({ company, className = "" }: { company: string | null | undefined; className?: string }) {
  const { t } = useTranslation();
  const label = company ? t("store.chainLabel", { company }) : t("store.independent");
  const Icon = company ? Building2 : Store;
  return (
    <span
      title={label}
      data-testid="store-kind"
      className={`inline-flex h-6 max-w-full min-w-0 items-center gap-[5px] rounded-full px-2.5 text-xs font-bold ${
        company ? "bg-brand-50 text-brand-800" : "bg-neutral-100 text-neutral-600"
      } ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export default StoreKindChip;
