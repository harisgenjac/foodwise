import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  // Icon-only round button (store cards) or a labelled pill (store details).
  variant?: "icon" | "pill";
}

function FavoriteButton({ isFavorite, onToggle, variant = "icon" }: FavoriteButtonProps) {
  const { t } = useTranslation();
  const label = isFavorite ? t("store.removeFromFavorites") : t("store.addToFavorites");

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isFavorite}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
          isFavorite
            ? "bg-orange-500 text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600"
            : "border border-orange-200 bg-white text-orange-600 hover:bg-orange-50"
        }`}
      >
        <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
        {isFavorite ? t("store.inFavorites") : t("store.addToFavorites")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-all hover:scale-105 ${
        isFavorite ? "text-orange-500" : "text-gray-400 hover:text-orange-500"
      }`}
    >
      <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
    </button>
  );
}

export default FavoriteButton;
