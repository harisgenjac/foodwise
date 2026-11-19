import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "./Modal.js";
import { SUGGESTED_IMAGES } from "../../utils/productImages.js";

interface SuggestedImagesModalProps {
  // The product's current image, selected when it is one of the suggested images.
  current: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}

// One plain gallery of the suggested images (not grouped or named by category). Clicking an image
// selects it; "Select image" confirms.
function SuggestedImagesModal({ current, onSelect, onClose }: SuggestedImagesModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [selected, setSelected] = useState<string | null>(
    SUGGESTED_IMAGES.some((image) => image.value === current) ? current : null,
  );

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
          {t("productImage.galleryTitle")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">{t("productImage.gallerySubtitle")}</p>
      </ModalHeader>
      <ModalBody>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SUGGESTED_IMAGES.map((image, index) => {
            const isSelected = selected === image.value;
            return (
              <li key={image.value}>
                <button
                  type="button"
                  onClick={() => setSelected(image.value)}
                  aria-pressed={isSelected}
                  aria-label={t("productImage.galleryOption", { number: index + 1 })}
                  className={`relative block aspect-4/3 w-full overflow-hidden rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? "border-brand-800 ring-4 ring-brand-100"
                      : "border-transparent hover:border-brand-200"
                  }`}
                >
                  <img src={image.src} alt="" className="h-full w-full object-cover" />
                  {isSelected && (
                    <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-800 text-white shadow">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-200 bg-white py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 cursor-pointer"
        >
          {t("productImage.cancel")}
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className="flex-1 rounded-xl bg-brand-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {t("productImage.select")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export default SuggestedImagesModal;
