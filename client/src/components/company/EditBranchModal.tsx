import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, Building2, MapPin, Phone } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import CitySelect from "../form/CitySelect.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import type { BranchDetails } from "../../types/index.js";

interface EditBranchModalProps {
  branch: BranchDetails["branch"];
  onClose: () => void;
  onSaved: () => void;
}

// The headquarters changes a branch's name, city, address and phone (the branch itself cannot
// change its name or city). Errors stay in the dialog.
function EditBranchModal({ branch, onClose, onSaved }: EditBranchModalProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    business_name: branch.business_name,
    city_id: branch.city_id ? String(branch.city_id) : "",
    address: branch.address ?? "",
    phone: branch.phone ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation(
    Object.fromEntries(Object.entries(values).map(([field, value]) => [field, isBlank(value) ? REQUIRED : undefined])),
  );
  const set = (field: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.put(`/company/branches/${branch.id}`, { ...values, city_id: Number(values.city_id) });
      toast.success(response.data.message);
      onSaved();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(message || t("admin.common.actionError"));
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t("company.branchDetails.editTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("company.branchDetails.editText")}</p>
        </div>
        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <FormField label={t("company.createBranch.name")} icon={Building2} required error={errorFor("business_name")}>
          <input
            type="text"
            value={values.business_name}
            onChange={(e) => set("business_name")(e.target.value)}
            onBlur={blur("business_name")}
            className={inputStyle}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("cities.label")} icon={MapPin} required error={errorFor("city_id")}>
            <CitySelect
              value={values.city_id}
              onChange={set("city_id")}
              emptyLabel={t("cities.choose")}
              onBlur={blur("city_id")}
              className={inputStyle}
            />
          </FormField>
          <FormField label={t("user.phone")} icon={Phone} required error={errorFor("phone")}>
            <input
              type="text"
              value={values.phone}
              onChange={(e) => set("phone")(e.target.value)}
              onBlur={blur("phone")}
              className={inputStyle}
            />
          </FormField>
        </div>
        <FormField label={t("user.address")} icon={MapPin} required error={errorFor("address")}>
          <input
            type="text"
            value={values.address}
            onChange={(e) => set("address")(e.target.value)}
            onBlur={blur("address")}
            className={inputStyle}
          />
        </FormField>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <RequiredHint />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t("admin.common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
            >
              {t("company.branchDetails.save")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default EditBranchModal;
