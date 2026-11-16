import { useState } from "react";
import { assetUrl } from "../../api/axios.js";
import genericStoreImage from "../../assets/store-placeholder.svg";

interface StoreLogoProps {
  logoUrl: string | null | undefined;
  // Size and rounding, e.g. "h-12 w-12 rounded-xl".
  className?: string;
}

// A store's logo, whole on a soft background; without one, or when it fails to load, one generic
// store image (never initials). Decorative: the store's name is always next to it.
function StoreLogo({ logoUrl, className = "" }: StoreLogoProps) {
  const src = logoUrl ? assetUrl(logoUrl) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showLogo = src !== null && failedSrc !== src;
  return (
    <span className={`flex shrink-0 overflow-hidden border border-gray-100 bg-gray-50 ${className}`}>
      {showLogo ? (
        <img src={src} alt="" data-testid="store-logo" onError={() => setFailedSrc(src)} className="h-full w-full object-contain p-1" />
      ) : (
        <img src={genericStoreImage} alt="" data-testid="store-generic-image" className="h-full w-full object-cover" />
      )}
    </span>
  );
}

export default StoreLogo;
