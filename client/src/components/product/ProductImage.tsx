import { useState } from "react";
import { GENERIC_PRODUCT_IMAGE, productImageSrc } from "../../utils/productImages.js";

interface ProductImageProps {
  imageUrl: string | null | undefined;
  alt: string;
  className?: string;
}

// A product's own image; without one, or when it fails to load, the generic product image.
function ProductImage({ imageUrl, alt, className = "" }: ProductImageProps) {
  const src = productImageSrc(imageUrl);
  // Remembers which src failed, so a new image (e.g. picked in the form) is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <img
      src={failedSrc === src ? GENERIC_PRODUCT_IMAGE : src}
      alt={alt}
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}

export default ProductImage;
