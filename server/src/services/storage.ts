import crypto from "crypto";
import fs from "fs";
import path from "path";
import { HttpError } from "../utils/httpError.js";

// Every uploaded file goes through this module, so moving to cloud storage at the deploy
// changes only this file. Today files live on the local disk under uploads/<kind>/ and are
// served by app.ts at /uploads (UPLOADS_URL_PREFIX). UPLOADS_DIR can point elsewhere so the
// tests and the e2e server never touch (or clean up) the files of the dev server.
// - logos: store, restaurant and company logos
// - products: product and template images
// - covers: the store page's cover image

export type UploadKind = "logos" | "products" | "covers";

export const UPLOADS_DIR = process.env.UPLOADS_DIR || "uploads";
export const UPLOADS_URL_PREFIX = "/uploads";
const KINDS: UploadKind[] = ["logos", "products", "covers"];

// The stored extension comes from the checked MIME type, never from the client's file name.
export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

for (const kind of KINDS) {
  fs.mkdirSync(path.join(UPLOADS_DIR, kind), { recursive: true });
}

const urlPrefix = (kind: UploadKind) => `${UPLOADS_URL_PREFIX}/${kind}/`;

// The stored file name of a URL of this kind, or null for anything else (another kind, an
// outside URL or a path that tries to leave the folder).
export const storedFileName = (kind: UploadKind, url: string | null | undefined) => {
  if (!url || !url.startsWith(urlPrefix(kind))) return null;
  const fileName = url.slice(urlPrefix(kind).length);
  return fileName !== "" && fileName === path.basename(fileName) ? fileName : null;
};

const kindOf = (url: string) => KINDS.find((kind) => storedFileName(kind, url) !== null);

// Saves an image upload (already checked by the upload middleware) and returns its public URL.
// `namePrefix` starts the file name, e.g. the owner's id, so ownership can be checked later.
export const saveImage = async (
  kind: UploadKind,
  file: { buffer: Buffer; mimetype: string },
  namePrefix: string,
) => {
  const extension = IMAGE_EXTENSIONS[file.mimetype];
  // The upload middleware already refused other types; this keeps the rule if a caller skips it.
  if (!extension) throw new HttpError(400, "Only JPEG, PNG and WEBP images are allowed.");
  const fileName = `${namePrefix}${Date.now()}-${crypto.randomBytes(4).toString("hex")}${extension}`;
  await fs.promises.writeFile(path.join(UPLOADS_DIR, kind, fileName), file.buffer);
  return `${urlPrefix(kind)}${fileName}`;
};

export const storedFileExists = async (url: string) => {
  const kind = kindOf(url);
  if (!kind) return false;
  try {
    await fs.promises.access(path.join(UPLOADS_DIR, kind, storedFileName(kind, url)!));
    return true;
  } catch {
    return false;
  }
};

// Deletes a stored file. Anything that is not one of our uploads is ignored, and so is a file
// that is already gone; other errors are logged, never thrown (the database change stands).
export const removeStoredFile = async (url: string | null | undefined) => {
  const kind = url ? kindOf(url) : undefined;
  if (!url || !kind) return;
  try {
    await fs.promises.unlink(path.join(UPLOADS_DIR, kind, storedFileName(kind, url)!));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    console.error("Error while deleting an uploaded file:", error);
  }
};

// The stored files of one kind with their URL and age, for cleaning up unused uploads.
export const listStoredFiles = async (kind: UploadKind) => {
  const dir = path.join(UPLOADS_DIR, kind);
  const names = await fs.promises.readdir(dir);
  const files = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const stat = await fs.promises.stat(path.join(dir, name));
    if (stat.isFile()) files.push({ url: `${urlPrefix(kind)}${name}`, modifiedAt: stat.mtime });
  }
  return files;
};
