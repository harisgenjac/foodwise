import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Building2, Clock, FileText, MapPin, Phone, Truck, UserRound } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import CitySelect from "../form/CitySelect.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import type { User } from "../../types/index.js";

interface EditProfileModalProps {
  user: User;
  name: string;
  onClose: () => void;
  onSaved: () => void;
}

type ProfileField =
  | "first_name"
  | "last_name"
  | "business_name"
  | "city_id"
  | "phone"
  | "address"
  | "opening_hours"
  | "pickup_hours"
  | "description";

// The admin corrects a user's profile; an admin account has only a name. The logo stays the user's.
function EditProfileModal({ user, name, onClose, onSaved }: EditProfileModalProps) {
  const { t } = useTranslation();
  const isBusiness = user.role !== "ADMIN";
  const [values, setValues] = useState<Record<ProfileField, string>>({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    business_name: user.business_name ?? "",
    city_id: user.city_id ? String(user.city_id) : "",
    phone: user.phone ?? "",
    address: user.address ?? "",
    opening_hours: user.opening_hours ?? "",
    pickup_hours: user.pickup_hours ?? "",
    description: user.description ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Same required fields as the user's own profile form (marked with *).
  const fields: { field: ProfileField; label: string; icon: LucideIcon; wide?: boolean; required?: boolean }[] = [
    { field: "first_name", label: t("admin.userDetails.firstName"), icon: UserRound, required: true },
    { field: "last_name", label: t("admin.userDetails.lastName"), icon: UserRound, required: true },
    ...(isBusiness
      ? [
          { field: "business_name" as const, label: t("admin.userDetails.businessName"), icon: Building2, wide: true, required: true },
          { field: "city_id" as const, label: t("admin.userDetails.city"), icon: MapPin, required: true },
          { field: "phone" as const, label: t("admin.userDetails.phone"), icon: Phone, required: true },
          { field: "address" as const, label: t("admin.userDetails.address"), icon: MapPin, wide: true, required: true },
          { field: "opening_hours" as const, label: t("admin.userDetails.openingHours"), icon: Clock },
          { field: "pickup_hours" as const, label: t("admin.userDetails.pickupHours"), icon: Truck },
        ]
      : []),
  ];

  const { formRef, errorFor, blur, validate } = useFormValidation<ProfileField>(
    Object.fromEntries(
      fields.filter(({ required }) => required).map(({ field }) => [field, isBlank(values[field]) ? REQUIRED : undefined]),
    ),
  );

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.put(`/admin/users/${user.id}/profile`, values);
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
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="max-h-[80vh] space-y-4 overflow-y-auto">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.userDetails.editProfileTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.userDetails.editProfileText", { name })}</p>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(({ field, label, icon, wide, required }) => {
            const setValue = (value: string) => setValues((current) => ({ ...current, [field]: value }));
            return (
              <div key={field} className={wide ? "sm:col-span-2" : undefined}>
                <FormField label={label} icon={icon} required={required ?? false} error={errorFor(field)}>
                  {field === "city_id" ? (
                    <CitySelect
                      value={values.city_id}
                      onChange={setValue}
                      emptyLabel={t("cities.choose")}
                      onBlur={blur(field)}
                      className={inputStyle}
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[field]}
                      onChange={(e) => setValue(e.target.value)}
                      onBlur={blur(field)}
                      className={inputStyle}
                    />
                  )}
                </FormField>
              </div>
            );
          })}
          {isBusiness && (
            <div className="sm:col-span-2">
              <FormField label={t("admin.userDetails.description")} icon={FileText}>
                <textarea
                  value={values.description}
                  onChange={(e) => setValues((current) => ({ ...current, description: e.target.value }))}
                  rows={3}
                  className={`${inputStyle} resize-none`}
                />
              </FormField>
            </div>
          )}
        </div>

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
              {t("admin.userDetails.saveProfile")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default EditProfileModal;
