import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  // A round heart (the store list's cards) or a labelled pill (the store page's header).
  variant?: "icon" | "pill";
}

// The favourite toggle (design/stores/): a real button with aria-pressed. The icon is a 44 px
// round button with a filled green heart for a favourite and an outlined grey one otherwise, named
// "Dodaj u omiljene" / "Ukloni iz omiljenih"; the pill reads "U omiljenim" (filled) or "Dodaj u
// omiljene" (outlined). The icon variant stops the click, so a card link around it does not open.
function FavoriteButton({ isFavorite, onToggle, variant = "icon" }: FavoriteButtonProps) {
  const { t } = useTranslation();
  const heart = <Heart className={`h-[18px] w-[18px] ${isFavorite ? "fill-current" : ""}`} aria-hidden="true" />;

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isFavorite}
        className={`flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-brand-800 px-[18px] text-sm font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
          isFavorite ? "bg-brand-800 text-white hover:bg-brand-900" : "bg-white text-brand-800 hover:bg-brand-50"
        }`}
      >
        {heart}
        {isFavorite ? t("store.inFavorites") : t("store.addToFavorites")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? t("store.removeFromFavorites") : t("store.addToFavorites")}
      className={`relative z-10 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#EEEDEB] bg-white hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
        isFavorite ? "text-brand-800" : "text-neutral-600"
      }`}
    >
      {heart}
    </button>
  );
}

export default FavoriteButton;
