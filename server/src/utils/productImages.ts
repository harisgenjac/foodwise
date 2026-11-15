import type { Pool, PoolClient } from "pg";
import { removeStoredFile, storedFileExists, storedFileName } from "../services/storage.js";

// A product's or template's image (image_url) is one of:
// - null: the client shows the generic product image
// - "suggested:<key>": one of the suggested images (the client holds the pictures)
// - "/uploads/products/<storeId>-<...>": a file the store uploaded (POST /api/products/images)
// Keep the keys in sync with client/src/utils/productImages.ts.
export const SUGGESTED_IMAGE_KEYS = [
  "meat",
  "fish",
  "dairy",
  "vegetables",
  "fruits",
  "bakery",
  "drinks",
  "frozen",
  "other",
];

const SUGGESTED_PREFIX = "suggested:";

// The suggested image that shows the category best. Only the seed uses it (and migration
// 1793000000036 once for existing rows): the category never sets a product's image.
const CATEGORY_IMAGE_KEYS: Record<string, string> = {
  Meat: "meat",
  Fish: "fish",
  Dairy: "dairy",
  Vegetables: "vegetables",
  Fruits: "fruits",
  Bakery: "bakery",
  Drinks: "drinks",
  "Frozen Food": "frozen",
};

export const suggestedImageFor = (category: string) =>
  `${SUGGESTED_PREFIX}${CATEGORY_IMAGE_KEYS[category] ?? "other"}`;

export const isSuggestedImage = (value: string) =>
  value.startsWith(SUGGESTED_PREFIX) && SUGGESTED_IMAGE_KEYS.includes(value.slice(SUGGESTED_PREFIX.length));

// Uploaded product images are named after the store that uploaded them.
export const productImageNamePrefix = (storeId: number) => `${storeId}-`;

const isOwnUpload = (value: string, storeId: number) =>
  storedFileName("products", value)?.startsWith(productImageNamePrefix(storeId)) ?? false;

export type ParsedImage = { value: string | null } | { error: string };

// Checks an image value a store sends with a product or template. `undefined` means the field
// was not sent; the caller decides what that means (keep the old image, or none).
export const parseProductImage = async (
  value: unknown,
  storeId: number,
): Promise<ParsedImage | undefined> => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return { value: null };
  if (typeof value === "string" && isSuggestedImage(value)) return { value };
  if (typeof value === "string" && isOwnUpload(value, storeId) && (await storedFileExists(value))) {
    return { value };
  }
  return { error: "Image is not valid." };
};

// Deletes an uploaded image no product or template uses any more. Products are never deleted
// (only marked Removed), so an image an old order still shows stays as long as its product.
export const releaseProductImage = async (db: Pool | PoolClient, url: string | null | undefined) => {
  if (!url || storedFileName("products", url) === null) return;
  const used = await db.query(
    `SELECT 1 FROM products WHERE products.image_url = $1
     UNION ALL
     SELECT 1 FROM product_templates WHERE product_templates.image_url = $1
     LIMIT 1`,
    [url],
  );
  if (used.rows.length === 0) await removeStoredFile(url);
};
