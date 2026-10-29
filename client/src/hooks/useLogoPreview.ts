import { useEffect, useState } from "react";

// The image types the server accepts for a logo (server/src/middleware/upload.middleware.ts).
export const LOGO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const LOGO_ACCEPT = LOGO_MIME_TYPES.join(",");

// A chosen logo file and its preview. The preview is only ever an object URL of the file itself
// (never its name or any typed text), used as an <img> src, and it is revoked when it is replaced,
// cleared or the page unmounts.
export function useLogoPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // false when the file is not one of the accepted image types (the caller shows the error).
  const select = (chosen: File) => {
    if (!LOGO_MIME_TYPES.includes(chosen.type)) return false;
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
    return true;
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
  };

  return { file, preview, select, clear };
}
