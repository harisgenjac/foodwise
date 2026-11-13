import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { sendChangeText } from "../../utils/orders.js";
import type { SendChange } from "../../types/index.js";

// What sending an order changed (a smaller quantity, a lower price, lines not sent), on the cart's
// confirmation and the order details. Nothing is shown without changes.
function SendChangesList({ changes }: { changes: SendChange[] }) {
  const { t } = useTranslation();
  if (changes.length === 0) return null;
  return (
    <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <Info className="h-4 w-4" />
        {t("orders.sendChangesTitle")}
      </p>
      <ul className="list-disc space-y-0.5 pl-6">
        {changes.map((change) => (
          <li key={`${change.product_id}-${change.kind}`}>{sendChangeText(change, t)}</li>
        ))}
      </ul>
    </div>
  );
}

export default SendChangesList;
