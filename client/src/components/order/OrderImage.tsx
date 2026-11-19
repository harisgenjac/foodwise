import { useState } from "react";
import { assetUrl } from "../../api/axios.js";
import genericOrderImage from "../../assets/order-placeholder.svg";

interface OrderImageProps {
  // The other party's logo: the store's for a restaurant, the restaurant's for a store.
  logoUrl: string | null | undefined;
  // The size and shape of the frame (e.g. "h-32 w-full", "h-10 w-10 rounded-lg").
  className?: string;
  // Lets the card's hover zoom reach the image.
  imageClassName?: string;
}

// An order's picture: the other party's logo, whole (never cropped) on a soft background, since
// an order can hold many products. Without a logo, or when it fails to load, the same generic
// order illustration for every order (never initials).
function OrderImage({ logoUrl, className = "", imageClassName = "" }: OrderImageProps) {
  const src = logoUrl ? assetUrl(logoUrl) : null;
  // Remembers which logo failed, so a new one is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showLogo = src !== null && failedSrc !== src;

  return (
    <div className={`overflow-hidden ${showLogo ? "bg-neutral-50" : ""} ${className}`}>
      {showLogo ? (
        <img
          src={src}
          alt=""
          data-testid="order-logo"
          onError={() => setFailedSrc(src)}
          className={`h-full w-full object-contain p-2 ${imageClassName}`}
        />
      ) : (
        <img
          src={genericOrderImage}
          alt=""
          data-testid="order-generic-image"
          className={`h-full w-full object-cover ${imageClassName}`}
        />
      )}
    </div>
  );
}

export default OrderImage;
