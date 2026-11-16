import { useId, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Building2, FileText, MapPin, Phone, UserRound } from "lucide-react";
import api from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import CitySelect from "../form/CitySelect.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { isScheduleValid, type Schedule } from "../../utils/schedule.js";
import WeeklyHoursEditor from "../profile/WeeklyHoursEditor.js";
import LocationPicker from "../profile/LocationPicker.js";
import { useCities } from "../../hooks/useCities.js";
import type { GeoPoint, User } from "../../types/index.js";

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
  | "description";

// The admin corrects a user's profile; an admin account has only a name, a company headquarters
// login a name and a phone. The logo stays the user's.
function EditProfileModal({ user, name, onClose, onSaved }: EditProfileModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const isBusiness = user.role === "STORE" || user.role === "RESTAURANT";
  const isCompany = user.role === "COMPANY";
  const [values, setValues] = useState<Record<ProfileField, string>>({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    business_name: user.business_name ?? "",
    city_id: user.city_id ? String(user.city_id) : "",
    phone: user.phone ?? "",
    address: user.address ?? "",
    description: user.description ?? "",
  });
  // Weekly hours, like on the user's own profile (sent once entered).
  const [openingSchedule, setOpeningSchedule] = useState<Schedule | null>(user.opening_schedule ?? null);
  const [pickupSchedule, setPickupSchedule] = useState<Schedule | null>(user.pickup_schedule ?? null);
  // The pin on the map, like on the user's own profile (sent as shown: removing it clears it).
  const [location, setLocation] = useState<GeoPoint | null>(
    user.latitude != null && user.longitude != null ? { latitude: user.latitude, longitude: user.longitude } : null,
  );
  const { cities } = useCities();
  const city = cities.find((entry) => String(entry.id) === values.city_id);
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
        ]
      : []),
    ...(isCompany
      ? [{ field: "phone" as const, label: t("admin.userDetails.phone"), icon: Phone, required: true }]
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
    if (!isScheduleValid(openingSchedule) || !isScheduleValid(pickupSchedule)) {
      setError(t("schedule.invalid"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await api.put(`/admin/users/${user.id}/profile`, {
        ...values,
        ...(isBusiness && { location }),
        ...(openingSchedule && { opening_schedule: openingSchedule }),
        ...(user.role === "STORE" && pickupSchedule && { pickup_schedule: pickupSchedule }),
      });
      toast.success(response.data.message);
      onSaved();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(message || t("admin.common.actionError"));
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">{t("admin.userDetails.editProfileTitle")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("admin.userDetails.editProfileText", { name })}</p>
      </ModalHeader>
      <form ref={formRef} noValidate onSubmit={handleSubmit} className={modalFormStyle}>
        <ModalBody className="space-y-4">
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
                <p className="mb-2 text-sm font-medium text-gray-700">{t("location.title")}</p>
                <LocationPicker
                  value={location}
                  onChange={setLocation}
                  cityCenter={city ? { latitude: city.latitude, longitude: city.longitude } : null}
                />
              </div>
            )}
            {isBusiness && (
              <div className="space-y-5 sm:col-span-2">
                <WeeklyHoursEditor
                  label={t("admin.userDetails.openingHours")}
                  value={openingSchedule}
                  onChange={setOpeningSchedule}
                  legacyText={user.opening_hours ?? null}
                />
                {user.role === "STORE" && (
                  <WeeklyHoursEditor
                    label={t("admin.userDetails.pickupHours")}
                    value={pickupSchedule}
                    onChange={setPickupSchedule}
                    legacyText={user.pickup_hours ?? null}
                  />
                )}
              </div>
            )}
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
          <RequiredHint />
        </ModalBody>

        <ModalFooter className="justify-end">
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
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default EditProfileModal;
