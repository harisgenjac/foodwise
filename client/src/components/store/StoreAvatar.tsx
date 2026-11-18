import { useState } from "react";
import { assetUrl } from "../../api/axios.js";
import type { User } from "../../types/index.js";

interface StoreAvatarProps {
  store: Pick<User, "business_name" | "logo_url">;
  // Size and rounding, e.g. "h-16 w-16 rounded-xl text-xl".
  className: string;
  // The name is already next to it (e.g. inside the same link): the image gets an empty alt and the
  // initials are hidden from screen readers, so the name is not read twice.
  decorative?: boolean;
}

const getInitials = (name: string | undefined) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

// The store's logo, or its initials when there is none or it fails to load.
function StoreAvatar({ store, className, decorative = false }: StoreAvatarProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const showLogo = store.logo_url && failedLogo !== store.logo_url;

  return (
    <span
      aria-hidden={decorative && !showLogo ? true : undefined}
      className={`flex shrink-0 items-center justify-center overflow-hidden border-4 border-white bg-orange-100 font-bold text-orange-700 shadow-md ${className}`}
    >
      {showLogo ? (
        <img
          src={assetUrl(store.logo_url ?? "")}
          alt={decorative ? "" : store.business_name}
          onError={() => setFailedLogo(store.logo_url ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(store.business_name)
      )}
    </span>
  );
}

export default StoreAvatar;
