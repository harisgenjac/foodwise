import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Languages, Megaphone, Store, Users, UtensilsCrossed } from "lucide-react";
import api from "../../api/axios.js";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FormSection from "../../components/form/FormSection.js";
import DateInput from "../../components/form/DateInput.js";
import FormField from "../../components/form/FormField.js";
import RequiredHint from "../../components/form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import ConfirmModal from "../../components/common/ConfirmModal.js";
import Pagination from "../../components/admin/Pagination.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import { toDateInput } from "../../utils/expiry.js";
import type { AdminAnnouncement, AnnouncementAudience } from "../../types/index.js";

const AUDIENCES: { code: AnnouncementAudience; icon: LucideIcon }[] = [
  { code: "ALL", icon: Users },
  { code: "STORE", icon: Store },
  { code: "RESTAURANT", icon: UtensilsCrossed },
];

const MAX_TITLE = 120;
const MAX_BODY = 1000;

const EMPTY_FORM = { title_bs: "", body_bs: "", title_en: "", body_en: "", expires: "" };

const fieldStyle =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100";

function AdminAnnouncementsPage() {
  const { t } = useTranslation();
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState<AdminAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);
  // The Bosnian text is required; the English translation is optional, but needs both parts once one is filled.
  const englishRequired = { title_en: !isBlank(form.body_en), body_en: !isBlank(form.title_en) };
  const { formRef, errorFor, blur, validate, reset } = useFormValidation({
    title_bs: isBlank(form.title_bs) ? REQUIRED : undefined,
    body_bs: isBlank(form.body_bs) ? REQUIRED : undefined,
    title_en: englishRequired.title_en && isBlank(form.title_en) ? REQUIRED : undefined,
    body_en: englishRequired.body_en && isBlank(form.body_en) ? REQUIRED : undefined,
  });
  const { page, offset, setPage } = useAdminPage();

  const { data: announcements, total, loading, error: loadError, refetch } = useFetch<AdminAnnouncement>(
    "/admin/announcements",
    "announcements",
    { limit: ADMIN_PAGE_SIZE, offset },
  );
  useKeepPageInRange(page, total, setPage);

  const audiences = t("admin.announcements.audiences", { returnObjects: true }) as Record<string, string>;
  const descriptions = t("admin.announcements.audienceDescriptions", { returnObjects: true }) as Record<string, string>;
  const setField = (field: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setConfirming(true);
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await api.post("/admin/announcements", {
        audience,
        title_bs: form.title_bs,
        body_bs: form.body_bs,
        title_en: form.title_en,
        body_en: form.body_en,
        // The chosen day is included: the announcement lasts until its end in local time.
        expires_at: form.expires ? new Date(`${form.expires}T23:59:59`).toISOString() : null,
      });
      toast.success(t("admin.announcements.sent", { count: response.data.recipients }));
      setForm(EMPTY_FORM);
      reset();
      setPage(1);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.announcements.sendError"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const end = async () => {
    if (!ending || busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/announcements/${ending.id}/end`);
      toast.success(t("admin.announcements.ended"));
      setEnding(null);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const textField = (field: "title_bs" | "title_en", label: string, required: boolean) => (
    <FormField label={label} required={required} error={errorFor(field)}>
      <input
        type="text"
        value={form[field]}
        maxLength={MAX_TITLE}
        onChange={(e) => setField(field)(e.target.value)}
        onBlur={blur(field)}
        className={fieldStyle}
      />
    </FormField>
  );
  const bodyField = (field: "body_bs" | "body_en", label: string, required: boolean) => (
    <FormField label={label} required={required} error={errorFor(field)}>
      <textarea
        value={form[field]}
        maxLength={MAX_BODY}
        rows={4}
        onChange={(e) => setField(field)(e.target.value)}
        onBlur={blur(field)}
        className={`${fieldStyle} resize-none`}
      />
    </FormField>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader title={t("admin.announcements.title")} subtitle={t("admin.announcements.subtitle")} icon={Megaphone} />

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FormSection title={t("admin.announcements.audienceSection")} icon={Users} required>
            <div role="radiogroup" aria-label={t("admin.announcements.audienceSection")} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {AUDIENCES.map(({ code, icon: Icon }) => {
                const selected = audience === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAudience(code)}
                    className={`flex cursor-pointer flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors ${
                      selected ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-200"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${selected ? "text-orange-600" : "text-gray-400"}`} strokeWidth={1.8} />
                    <span className="font-semibold text-gray-900">{audiences[code]}</span>
                    <span className="text-xs text-gray-500">{descriptions[code]}</span>
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection title={t("admin.announcements.bosnianSection")} icon={Megaphone}>
            <div className="space-y-4">
              {textField("title_bs", t("admin.announcements.titleLabel"), true)}
              {bodyField("body_bs", t("admin.announcements.bodyLabel"), true)}
            </div>
          </FormSection>

          <FormSection
            title={t("admin.announcements.englishSection")}
            icon={Languages}
            description={t("admin.announcements.englishHint")}
          >
            <div className="space-y-4">
              {textField("title_en", `${t("admin.announcements.titleLabel")} (EN)`, englishRequired.title_en)}
              {bodyField("body_en", `${t("admin.announcements.bodyLabel")} (EN)`, englishRequired.body_en)}
            </div>
          </FormSection>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <DateInput
              label={t("admin.announcements.expiresLabel")}
              value={form.expires}
              onChange={setField("expires")}
              min={toDateInput(new Date())}
            />
            <p className="mt-2 text-xs text-gray-500">{t("admin.announcements.expiresHint")}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">{t("admin.announcements.preview")}</p>
            <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                <Megaphone className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{t("announcements.label")}</p>
                {form.title_bs || form.body_bs ? (
                  <>
                    <p className="mt-0.5 break-words font-semibold text-blue-950">{form.title_bs}</p>
                    <p className="mt-0.5 whitespace-pre-line break-words text-sm text-blue-900">{form.body_bs}</p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm text-blue-800">{t("admin.announcements.previewEmpty")}</p>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {t("admin.announcements.send")}
          </button>
          <RequiredHint className="text-center" />
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{t("admin.announcements.listSection")}</h2>
        {loading ? (
          <LoadingSpinner />
        ) : loadError ? (
          <LoadErrorState />
        ) : announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title={t("admin.announcements.emptyTitle")} subtitle={t("admin.announcements.emptySubtitle")} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">{t("admin.announcements.columnAnnouncement")}</th>
                    <th className="px-4 py-3">{t("admin.announcements.columnAudience")}</th>
                    <th className="hidden px-4 py-3 md:table-cell">{t("admin.announcements.columnSent")}</th>
                    <th className="hidden px-4 py-3 md:table-cell">{t("admin.announcements.columnReach")}</th>
                    <th className="px-4 py-3">{t("admin.announcements.columnStatus")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {announcements.map((announcement) => (
                    <tr key={announcement.id} className="align-top">
                      <td className="max-w-xs px-4 py-3">
                        <p className="font-medium text-gray-900">{announcement.title_bs}</p>
                        <p className="line-clamp-2 text-xs text-gray-500">{announcement.body_bs}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{audiences[announcement.audience]}</td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 md:table-cell">
                        {formatDateTime(announcement.created_at)}
                        <br />
                        <span className="text-xs">{announcement.admin_email}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                        {announcement.recipients} / {announcement.dismissed}
                      </td>
                      <td className="px-4 py-3">
                        {announcement.is_active ? (
                          <span className="whitespace-nowrap rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                            {t("admin.announcements.statusActive")}
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                            {t("admin.announcements.statusEnded")}
                          </span>
                        )}
                        {announcement.is_active && announcement.expires_at && (
                          <p className="mt-1 text-xs text-gray-500">
                            {t("admin.announcements.until", { date: formatDateTime(announcement.expires_at) })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {announcement.is_active && (
                          <button
                            type="button"
                            onClick={() => setEnding(announcement)}
                            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            {t("admin.announcements.end")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
          </>
        )}
      </section>

      {confirming && (
        <ConfirmModal
          variant="success"
          icon={Megaphone}
          title={t("admin.announcements.confirmTitle")}
          message={t("admin.announcements.confirmText", { title: form.title_bs, audience: audiences[audience] })}
          confirmLabel={t("admin.announcements.confirmSend")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={send}
          onClose={() => setConfirming(false)}
        />
      )}

      {ending && (
        <ConfirmModal
          variant="danger"
          title={t("admin.announcements.endTitle")}
          message={t("admin.announcements.endText", { title: ending.title_bs })}
          confirmLabel={t("admin.announcements.end")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={end}
          onClose={() => setEnding(null)}
        />
      )}
    </div>
  );
}

export default AdminAnnouncementsPage;
