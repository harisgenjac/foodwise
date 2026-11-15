import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";
import { ImageIcon, Images, Loader2, Trash2, Upload } from "lucide-react";
import api from "../../api/axios.js";
import FormSection from "../form/FormSection.js";
import ProductImage from "./ProductImage.js";
import SuggestedImagesModal from "./SuggestedImagesModal.js";
import { MAX_PRODUCT_IMAGE_MB, PRODUCT_IMAGE_TYPES } from "../../utils/productImages.js";

interface ProductImagePickerProps {
  // "" when the product has no image (the generic image is shown).
  value: string;
  onChange: (value: string) => void;
}

const buttonStyle =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 disabled:opacity-60 cursor-pointer";

// The product's own image on Add product and Edit product: an upload (sent to the server at once,
// the form then saves its URL) or one of the suggested images. No camera option for now.
function ProductImagePicker({ value, onChange }: ProductImagePickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const upload = async (file: File) => {
    if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
      toast.error(t("productImage.invalidType"));
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_MB * 1024 * 1024) {
      toast.error(t("productImage.tooLarge"));
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const response = await api.post("/products/images", data);
      onChange(response.data.image_url);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("productImage.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <FormSection title={t("productImage.title")} icon={ImageIcon} description={t("productImage.hint")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 sm:w-44">
          <ProductImage
            imageUrl={value || null}
            alt={value ? t("productImage.current") : t("productImage.none")}
            className="h-full w-full object-cover"
          />
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="h-6 w-6 animate-spin text-orange-600" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={buttonStyle}>
            <Upload className="h-4 w-4" />
            {uploading ? t("productImage.uploading") : t("productImage.upload")}
          </button>
          <button type="button" onClick={() => setGalleryOpen(true)} disabled={uploading} className={buttonStyle}>
            <Images className="h-4 w-4" />
            {t("productImage.suggested")}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={uploading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              {t("productImage.remove")}
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={PRODUCT_IMAGE_TYPES.join(",")}
          aria-label={t("productImage.upload")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {galleryOpen && (
        <SuggestedImagesModal
          current={value || null}
          onClose={() => setGalleryOpen(false)}
          onSelect={(selected) => {
            onChange(selected);
            setGalleryOpen(false);
          }}
        />
      )}
    </FormSection>
  );
}

export default ProductImagePicker;
