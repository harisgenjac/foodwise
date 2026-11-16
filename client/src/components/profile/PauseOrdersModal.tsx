import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PauseCircle } from "lucide-react";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "../product/Modal.js";
import { PAUSE_OPTIONS, type PauseOption } from "../../utils/orderPause.js";

interface PauseOrdersModalProps {
  busy: boolean;
  onConfirm: (option: PauseOption) => void;
  onClose: () => void;
}

// Asks how long the store pauses new orders: a few hours, the rest of the day, or until it
// switches the pause off itself.
function PauseOrdersModal({ busy, onConfirm, onClose }: PauseOrdersModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [option, setOption] = useState<PauseOption>("1h");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!busy) onConfirm(option);
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader className="flex flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <PauseCircle className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h3 id={titleId} className="text-lg font-bold text-gray-900">
          {t("orderPause.modalTitle")}
        </h3>
      </ModalHeader>
      <form noValidate onSubmit={handleSubmit} className={modalFormStyle}>
        <ModalBody className="pt-1">
          <p className="text-center text-sm text-gray-500">{t("orderPause.modalText")}</p>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium text-gray-700">{t("orderPause.howLong")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {PAUSE_OPTIONS.map((value) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                    option === value
                      ? "border-orange-400 bg-orange-50 font-semibold text-orange-800"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="pause-length"
                    value={value}
                    checked={option === value}
                    onChange={() => setOption(value)}
                    className="h-4 w-4 accent-orange-500"
                  />
                  {t(`orderPause.options.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </ModalBody>
        <ModalFooter className="pt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 cursor-pointer rounded-xl bg-amber-500 py-2.5 font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
          >
            {t("orderPause.confirm")}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default PauseOrdersModal;
