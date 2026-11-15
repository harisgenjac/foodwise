import cron from "node-cron";
import pool from "../config/db.js";
import { APP_TIMEZONE } from "../utils/dates.js";
import { listStoredFiles, removeStoredFile } from "../services/storage.js";

// A product image is uploaded before its form is saved, so a form left unsaved leaves a file no
// product or template uses. Files older than a day (no form is still open on them) are deleted.
export const UNUSED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;

export const removeUnusedProductImages = async (now = new Date()): Promise<number> => {
  const files = (await listStoredFiles("products")).filter(
    (file) => now.getTime() - file.modifiedAt.getTime() > UNUSED_UPLOAD_AGE_MS,
  );
  if (files.length === 0) return 0;
  const used = await pool.query<{ image_url: string }>(
    `SELECT products.image_url FROM products WHERE products.image_url = ANY($1::text[])
     UNION
     SELECT product_templates.image_url FROM product_templates WHERE product_templates.image_url = ANY($1::text[])`,
    [files.map((file) => file.url)],
  );
  const usedUrls = new Set(used.rows.map((row) => row.image_url));
  let removed = 0;
  for (const file of files) {
    if (usedUrls.has(file.url)) continue;
    await removeStoredFile(file.url);
    removed += 1;
  }
  return removed;
};

const runCleanup = async () => {
  try {
    await removeUnusedProductImages();
  } catch (error) {
    console.error("Error running upload cleanup job:", error);
  }
};

export const startUploadCleanupJob = () => {
  cron.schedule("30 3 * * *", runCleanup, { timezone: APP_TIMEZONE });
};
