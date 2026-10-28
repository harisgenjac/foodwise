import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, Search, Store } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import { inputStyle } from "../form/FormField.js";
import { FilterField } from "../product/FilterBar.js";
import { useFetch } from "../../hooks/useFetch.js";
import type { User } from "../../types/index.js";

interface AttachStoreModalProps {
  companyId: number;
  companyName: string;
  onClose: () => void;
  onAttached: () => void;
}

// For a chain whose stores are already on the platform: the admin searches the stores and
// attaches one without a company to this company. There is no detach.
function AttachStoreModal({ companyId, companyName, onClose, onAttached }: AttachStoreModalProps) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data: stores, loading } = useFetch<User>("/admin/users", "users", { role: "STORE", q, limit: 20, offset: 0 });
  const candidates = stores.filter((store) => !store.company_id);

  const attach = async (store: User) => {
    if (busyId !== null) return;
    setBusyId(store.id);
    setError("");
    try {
      const response = await api.post(`/admin/companies/${companyId}/branches/attach`, { user_id: store.id });
      toast.success(response.data.message);
      onAttached();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(message || t("admin.common.actionError"));
      setBusyId(null);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.companyDetails.attachTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.companyDetails.attachText", { name: companyName })}</p>
        </div>
        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.companyDetails.attachSearch")}
            aria-label={t("admin.companyDetails.attachSearch")}
            className={inputStyle}
          />
        </FilterField>
        {loading ? null : candidates.length === 0 ? (
          <p className="text-sm text-gray-500">{t("admin.companyDetails.attachNone")}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {candidates.map((store) => (
              <li key={store.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{store.business_name || store.email}</p>
                  <p className="truncate text-xs text-gray-500">{[store.email, store.city].filter(Boolean).join(" · ")}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => attach(store)}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
                >
                  <Store className="h-4 w-4" />
                  {t("admin.companyDetails.attach")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AttachStoreModal;
