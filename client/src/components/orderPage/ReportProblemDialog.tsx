import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, X } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "../product/Modal.js";
import { formatOrderCode } from "../../utils/orders.js";
import type { DeliveryProblemReason, FulfilmentMethod, PickupProblemReason, ProblemReason } from "../../types/index.js";

// The reasons per method, in the server's order (services/orderProblems.ts PROBLEM_REASONS).
export const PROBLEM_REASONS: { DELIVERY: DeliveryProblemReason[]; PICKUP: PickupProblemReason[] } = {
  DELIVERY: ["LATE", "MISSING_ITEM", "DAMAGED", "COURIER", "PAYMENT", "OTHER"],
  PICKUP: ["PICKUP_TIME", "MISSING_ITEM", "DAMAGED", "STORE", "OTHER"],
};

// The server's limit on the description.
const MAX_TEXT = 1000;

const GHOST_BUTTON =
  "inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white px-5 text-sm font-bold text-neutral-700 transition-colors hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:flex-none";
const PRIMARY_BUTTON =
  "inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-full bg-brand-800 px-5 text-sm font-bold text-white transition-colors hover:bg-brand-900 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none";

interface ReportProblemDialogProps {
  order: { id: number; code: string; fulfilment_method: FulfilmentMethod; storeName: string };
  onClose: () => void;
  // The report was saved (the page loads the order again, so it shows the report).
  onReported: () => void;
}

// "Prijavi problem" (design/order-details/order-details-report-problem.html): the reasons for the
// order's method as radio buttons, an optional description, and POST /orders/:id/problems. The send
// button is enabled once a reason is chosen; a server error (e.g. past the 48 hours) shows in the
// dialog; after sending, the dialog says the report was sent. Modal traps the focus, closes on
// Escape and returns the focus to "Prijavi problem".
function ReportProblemDialog({ order, onClose, onReported }: ReportProblemDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const textId = useId();
  const [reason, setReason] = useState<ProblemReason | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);

  // The confirmation replaces the form: the focus moves to its "Zatvori".
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/problems`, { reason, text: text.trim() || null });
      setSent(true);
      onReported();
    } catch (err) {
      console.error(err);
      setError(apiErrorMessage(err) || t("orderPage.problem.error"));
    } finally {
      setBusy(false);
    }
  };

  // One dialog: the form, then the confirmation in its place.
  return (
    <Modal onClose={onClose} labelledBy={titleId} widthClassName="max-w-[480px]">
      {sent ? (
        <ModalBody className="flex flex-col items-center gap-3 pt-7 pb-6 text-center">
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-800">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h2 id={titleId} className="text-xl font-extrabold text-neutral-900">
            {t("orderPage.problem.sentTitle")}
          </h2>
          <p className="text-[15px] text-neutral-600">{t("orderPage.problem.sentText")}</p>
          <button ref={doneRef} type="button" onClick={onClose} className={`${PRIMARY_BUTTON} mt-2 w-full sm:w-auto`}>
            {t("orderPage.problem.close")}
          </button>
        </ModalBody>
      ) : (
        <>
          <ModalHeader className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-extrabold text-neutral-900">
                {t("orderPage.problem.title")}
              </h2>
              <p className="mt-0.5 text-sm text-neutral-600">
                {t("orderPage.problem.subtitle", { code: formatOrderCode(order.code), store: order.storeName })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("orderPage.problem.close")}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-900 transition-colors hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </ModalHeader>
          <form onSubmit={submit} className={modalFormStyle} noValidate>
            <ModalBody className="flex flex-col gap-4">
              <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                <legend className="mb-2 text-sm font-semibold text-neutral-900">{t("orderPage.problem.question")}</legend>
                {PROBLEM_REASONS[order.fulfilment_method].map((value) => {
                  const checked = reason === value;
                  return (
                    <label
                      key={value}
                      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2 text-[15px] font-semibold text-neutral-900 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-300 ${
                        checked ? "border-brand-800 bg-brand-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="problem-reason"
                        value={value}
                        checked={checked}
                        onChange={() => setReason(value)}
                        className="m-0 h-[18px] w-[18px] shrink-0 accent-brand-800 focus:outline-none"
                      />
                      {t(`orders.problems.reasons.${value}`)}
                    </label>
                  );
                })}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={textId} className="text-sm font-semibold text-neutral-900">
                  {t("orderPage.problem.description")}
                </label>
                <textarea
                  id={textId}
                  rows={3}
                  maxLength={MAX_TEXT}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("orderPage.problem.placeholder")}
                  className="w-full resize-y rounded-xl border border-neutral-200 px-3.5 py-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-800 focus:shadow-[0_0_0_3px_var(--color-brand-100)]"
                />
              </div>
              {error && (
                <p
                  role="alert"
                  data-testid="problem-error"
                  className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm font-semibold text-danger-700"
                >
                  {error}
                </p>
              )}
            </ModalBody>
            <ModalFooter className="justify-end">
              <button type="button" onClick={onClose} className={GHOST_BUTTON}>
                {t("orderPage.problem.cancel")}
              </button>
              <button type="submit" disabled={!reason || busy} className={PRIMARY_BUTTON}>
                {t("orderPage.problem.send")}
              </button>
            </ModalFooter>
          </form>
        </>
      )}
    </Modal>
  );
}

export default ReportProblemDialog;
