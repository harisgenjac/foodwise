import { assetUrl } from "../api/axios.js";
import { CATEGORY_IMAGES } from "./categoryImages.js";
import genericProductImage from "../assets/product-placeholder.svg";

// A product's (and a template's) image_url, as the server stores it:
// - null: the generic product image
// - "suggested:<key>": one of SUGGESTED_IMAGES
// - "/uploads/products/<file>": an image the store uploaded
// The keys match server/src/utils/productImages.ts. The pictures are the photos categories used
// to have; the category no longer chooses one.
export const SUGGESTED_IMAGES: { value: string; src: string }[] = [
  { value: "suggested:meat", src: CATEGORY_IMAGES.Meat! },
  { value: "suggested:fish", src: CATEGORY_IMAGES.Fish! },
  { value: "suggested:dairy", src: CATEGORY_IMAGES.Dairy! },
  { value: "suggested:vegetables", src: CATEGORY_IMAGES.Vegetables! },
  { value: "suggested:fruits", src: CATEGORY_IMAGES.Fruits! },
  { value: "suggested:bakery", src: CATEGORY_IMAGES.Bakery! },
  { value: "suggested:drinks", src: CATEGORY_IMAGES.Drinks! },
  { value: "suggested:frozen", src: CATEGORY_IMAGES["Frozen Food"]! },
  { value: "suggested:other", src: CATEGORY_IMAGES.Other! },
];

export const GENERIC_PRODUCT_IMAGE = genericProductImage;

// The upload rules the server checks too (POST /products/images).
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PRODUCT_IMAGE_MB = 5;

export const productImageSrc = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return GENERIC_PRODUCT_IMAGE;
  if (imageUrl.startsWith("suggested:")) {
    return SUGGESTED_IMAGES.find((image) => image.value === imageUrl)?.src ?? GENERIC_PRODUCT_IMAGE;
  }
  return assetUrl(imageUrl);
};
