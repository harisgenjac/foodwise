import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, Building2, FileText } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import type { Company } from "../../types/index.js";

interface EditCompanyModalProps {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}

// Only an admin changes a company's name; the description can be edited by both sides.
function EditCompanyModal({ company, onClose, onSaved }: EditCompanyModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    name: isBlank(name) ? REQUIRED : undefined,
  });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.put(`/admin/companies/${company.id}`, { name, description });
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
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.companyDetails.editTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.companyDetails.editText", { name: company.name })}</p>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <FormField label={t("admin.companyDetails.name")} icon={Building2} required error={errorFor("name")}>
          <input
            type="text"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={blur("name")}
            className={inputStyle}
          />
        </FormField>
        <FormField label={t("admin.companyDetails.description")} icon={FileText}>
          <textarea
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`${inputStyle} resize-none`}
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
              {t("admin.companyDetails.save")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default EditCompanyModal;
