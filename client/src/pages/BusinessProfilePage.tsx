import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ArrowLeft, Check, Clock, Coins, IdCard, Lock, MapPin, Save, Truck, UserRound } from "lucide-react";
import api, { apiErrorMessage } from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import { useCredits } from "../context/CreditsContext.js";
import { useCities } from "../hooks/useCities.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import RequiredHint from "../components/form/RequiredHint.js";
import SubscribeModal from "../components/credits/SubscribeModal.js";
import { ProfileSection } from "../components/businessProfile/ui.js";
import BasicInfoSection from "../components/businessProfile/BasicInfoSection.js";
import LocationSection from "../components/businessProfile/LocationSection.js";
import HoursSection from "../components/businessProfile/HoursSection.js";
import OrdersSection from "../components/businessProfile/OrdersSection.js";
import CreditsSection from "../components/businessProfile/CreditsSection.js";
import PasswordSection from "../components/businessProfile/PasswordSection.js";
import {
  changes,
  draftFromUser,
  FIELD_SECTION,
  hasChanges,
  validateDraft,
  type ProfileDraft,
  type ProfileErrors,
  type SectionId,
} from "../components/businessProfile/draft.js";
import { LOCATION_SECTION } from "../components/profile/LocationPicker.js";
import { SUBSCRIPTION_SECTION, TOPUP_SECTION, nextCreditMonth } from "../utils/credits.js";
import { translateServerMessage } from "../i18n/serverMessages.js";
import type { User } from "../types/index.js";

// The DOM ids of the sections; the location and credits ones are the targets of existing links
// (/my-profile#location, #subscription, #topup).
const SECTION_DOM_ID: Record<SectionId, string> = {
  basic: "basic",
  location: LOCATION_SECTION,
  hours: "hours",
  orders: "orders",
  credits: SUBSCRIPTION_SECTION,
  password: "password",
};

// The emails' footer link points at the email notifications switch.
const EMAIL_NOTIFICATIONS_ANCHOR = "email-notifications";

// Server messages that belong to one field (matched in the user's language).
const SERVER_FIELD: Record<string, string> = {
  "Invalid city.": "city",
  "Location is not valid.": "location",
  "The location on the map is too far from the chosen city.": "location",
  "Opening hours are not valid.": "openingSchedule",
  "Pickup hours are not valid.": "pickupSchedule",
  "Current password is incorrect.": "current",
};
const fieldForServerMessage = (message: string) =>
  Object.entries(SERVER_FIELD).find(([english]) => translateServerMessage(english) === message)?.[1];

// A step of the save failed: which field (or section) shows the message.
class SaveError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

const roundButton =
  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 disabled:cursor-wait disabled:opacity-60";

// My profile for restaurants and stores (store branches included; design/profile/): a header and
// accordion sections, all saved together with "Sačuvaj izmjene" (or the round save button at the
// top). The page keeps everything in one draft and compares it with the saved state, so a save
// sends only what changed and the page knows when something is unsaved.
function BusinessProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { user: sessionUser, refreshUser } = useAuth();
  const { credits, refresh: refreshCredits } = useCredits();
  const { cities } = useCities();
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saved, setSaved] = useState<ProfileDraft | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    basic: true,
    location: false,
    hours: false,
    orders: false,
    credits: false,
    password: Boolean(sessionUser?.must_change_password),
  });
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmingPlan, setConfirmingPlan] = useState(false);
  const [creditsReload, setCreditsReload] = useState(0);
  // Bumped after a failed validation, so the first error is focused once the sections are open.
  const [focusRequest, setFocusRequest] = useState(0);
  // Not a <form>: the dialogs on the page have their own forms, and React would carry their submit
  // up to it through the portal.
  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await api.get("/users/me");
    const data: User = response.data.user;
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    load()
      .then((data) => {
        const initial = draftFromUser(data, null);
        setDraft(initial);
        setSaved(initial);
      })
      .catch((err) => {
        console.error("Error fetching profile:", err);
        setLoadFailed(true);
      });
  }, [load]);

  // Links to a section open it and scroll to it.
  useEffect(() => {
    if (!draft || !hash) return;
    const target = hash.slice(1);
    // #topup is inside the credits section, #email-notifications (the emails' footer link) inside
    // Osnovne informacije.
    const section =
      target === TOPUP_SECTION ? "credits" : target === EMAIL_NOTIFICATIONS_ANCHOR ? "basic" : (Object.entries(SECTION_DOM_ID).find(([, id]) => id === target)?.[0] as SectionId | undefined);
    if (!section) return;
    setOpen((current) => ({ ...current, [section]: true }));
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
    // Only when the page loads or the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, Boolean(draft)]);

  useEffect(() => {
    if (focusRequest === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>("[data-invalid]");
    if (!invalid) return;
    invalid.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const target = invalid.matches("input, select, textarea, button")
      ? invalid
      : invalid.querySelector<HTMLElement>("input, select, textarea, button");
    target?.focus({ preventScroll: true });
  }, [focusRequest]);

  const isStore = user?.role === "STORE";
  const isBranch = isStore && Boolean(user?.company_name);
  const passwordRequired = Boolean(sessionUser?.must_change_password);
  const city = cities.find((entry) => String(entry.id) === draft?.cityId);
  const dirty = useMemo(() => (draft && saved ? hasChanges(draft, saved) : false), [draft, saved]);

  if (loadFailed) return <LoadErrorState />;
  if (!user || !draft || !saved) return <LoadingSpinner />;

  const update = (change: Partial<ProfileDraft>) => {
    setDraft((current) => (current ? { ...current, ...change } : current));
    // Editing a field clears its error.
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(change)) delete next[key === "cityId" ? "city" : key];
      return next;
    });
  };

  const toggle = (section: SectionId) => setOpen((current) => ({ ...current, [section]: !current[section] }));

  const showErrors = (found: ProfileErrors) => {
    setErrors(found);
    const sections = new Set(Object.keys(found).map((field) => FIELD_SECTION[field] ?? "basic"));
    setOpen((current) => {
      const next = { ...current };
      for (const section of sections) next[section] = true;
      return next;
    });
    setFocusRequest((request) => request + 1);
  };

  // The steps of a save, in order; the first failure stops it and is shown on its field.
  // `done` collects the steps that went through, so a failed save does not repeat them.
  const send = async (planAutoRenew: boolean, done: Set<string>) => {
    const what = changes(draft, saved);
    const step = async (field: string, run: () => Promise<unknown>, key = field) => {
      try {
        await run();
        done.add(key);
      } catch (err) {
        const message = apiErrorMessage(err) ?? t("profile.save.error");
        throw new SaveError(fieldForServerMessage(message) ?? field, message);
      }
    };

    if (draft.logoFile) {
      const form = new FormData();
      form.append("logo", draft.logoFile);
      await step("logo", () => api.post("/users/me/logo", form, { headers: { "Content-Type": "multipart/form-data" } }));
    } else if (draft.removeLogo) {
      await step("logo", () => api.delete("/users/me/logo"));
    }
    if (what.profile) {
      await step("profile", () =>
        api.put("/users/me", {
          first_name: draft.firstName,
          last_name: draft.lastName,
          // A branch's name and city are managed by its company (the server ignores them).
          ...(!isBranch && { business_name: draft.businessName, city_id: Number(draft.cityId) }),
          phone: draft.phone,
          address: draft.address,
          location: draft.location,
          // Weekly hours are sent once entered (until then the stored ones stay as they are).
          ...(draft.openingSchedule && { opening_schedule: draft.openingSchedule }),
          ...(isStore && draft.pickupSchedule && { pickup_schedule: draft.pickupSchedule }),
          description: draft.description,
        }),
      );
    }
    if (what.emailNotifications) {
      await step("emailNotifications", () => api.patch("/users/me/email-notifications", { enabled: draft.emailNotifications }));
    }
    if (what.orders && draft.orders && saved.orders) {
      const orderChange = Object.fromEntries(
        Object.entries(draft.orders).filter(([key, value]) => saved.orders![key as keyof typeof saved.orders] !== value),
      );
      // A pause always goes with its end.
      if ("orders_paused" in orderChange || "orders_paused_until" in orderChange) {
        orderChange.orders_paused = draft.orders.orders_paused;
        orderChange.orders_paused_until = draft.orders.orders_paused ? draft.orders.orders_paused_until : null;
      }
      await step("orders", () => api.patch("/users/me/order-settings", orderChange));
    }
    for (const id of draft.credits.withdraw) {
      await step("credits", () => api.delete(`/credits/requests/${id}`), `withdraw:${id}`);
    }
    const subscription = credits?.subscription;
    if (draft.credits.autoRenew !== null && subscription && draft.credits.autoRenew !== subscription.auto_renew) {
      await step("credits", () => api.patch("/credits/subscription/auto-renew", { auto_renew: draft.credits.autoRenew }), "autoRenew");
    }
    if (draft.credits.plan) {
      const plan = draft.credits.plan;
      await step("credits", () =>
        api.post("/credits/requests", {
          request_type: "SUBSCRIPTION",
          plan_id: plan.id,
          period: subscription ? "next" : "current",
          auto_renew: planAutoRenew,
        }),
        "plan",
      );
    }
    if (draft.credits.topup) {
      const topup = draft.credits.topup;
      await step("credits", () => api.post("/credits/requests", { request_type: "TOPUP", topup_package_id: topup.id }), "topup");
    }
    if (what.password) {
      await step("current", () =>
        api.put("/users/me/password", { current_password: draft.password.current, new_password: draft.password.next }),
      );
    }
  };

  const save = async (planAutoRenew?: boolean) => {
    if (saving) return;
    const found = validateDraft(draft, { isBranch, isStore, passwordRequired });
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    // A subscription request is explained first (what costs a credit, refunds, expiry, renewal).
    if (draft.credits.plan && planAutoRenew === undefined) {
      setConfirmingPlan(true);
      return;
    }
    setConfirmingPlan(false);
    setSaving(true);
    let failure: SaveError | null = null;
    const done = new Set<string>();
    try {
      await send(planAutoRenew ?? false, done);
    } catch (err) {
      failure = err instanceof SaveError ? err : new SaveError("profile", t("profile.save.error"));
    }
    // What was sent is reloaded, so the page shows the saved state (also after a failed step).
    try {
      const fresh = await load();
      const reloaded = draftFromUser(fresh, null);
      await refreshCredits();
      setCreditsReload((key) => key + 1);
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      setSaved(reloaded);
      // After a failure the page keeps what is still unsent; what went through is the saved state.
      setDraft(
        failure
          ? {
              ...draft,
              logoFile: done.has("logo") ? null : draft.logoFile,
              removeLogo: done.has("logo") ? false : draft.removeLogo,
              credits: {
                autoRenew: done.has("autoRenew") ? null : draft.credits.autoRenew,
                plan: done.has("plan") ? null : draft.credits.plan,
                topup: done.has("topup") ? null : draft.credits.topup,
                withdraw: draft.credits.withdraw.filter((id) => !done.has(`withdraw:${id}`)),
              },
            }
          : reloaded,
      );
    } catch (err) {
      console.error("Error reloading profile:", err);
    }
    setSaving(false);
    if (failure) {
      showErrors({ [failure.field]: failure.message });
      toast.error(failure.message);
      return;
    }
    setErrors({});
    toast.success(t("profile.save.saved"));
  };

  const sectionError = (field: string) => (errors[field] ? errors[field] : undefined);
  const subtitle = t(isStore ? "profile.header.storeSubtitle" : "profile.header.restaurantSubtitle");
  const addressLine = [draft.address, city?.name].filter(Boolean).join(", ");
  const hasErrorIn = (section: SectionId) => Object.keys(errors).some((field) => (FIELD_SECTION[field] ?? "basic") === section);
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/dashboard"));
  const requestMonth = credits ? (credits.subscription ? nextCreditMonth(credits.periodStart) : credits.periodStart) : "";

  return (
    <div
      ref={formRef}
      data-testid="business-profile"
      data-dirty={dirty || undefined}
      className="mx-auto max-w-[1180px] space-y-5 pb-16 font-jakarta text-neutral-900"
    >
      <header className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-800">
          <UserRound className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.5px]">{t("profile.header.title")}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
            <span>
              {saved.businessName || user.email} · {subtitle}
            </span>
            {isBranch && (
              <span data-testid="branch-chip" className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                {t("profile.header.branchChip", { company: user.company_name })}
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={goBack} aria-label={t("profile.header.back")} className={`${roundButton} border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50`}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => save()} disabled={saving} aria-label={t("profile.header.save")} className={`${roundButton} bg-brand-800 text-white hover:bg-brand-900`}>
          <Save className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <ProfileSection
        id={SECTION_DOM_ID.basic}
        icon={IdCard}
        title={t("profile.sections.basic.title")}
        description={t(isStore ? "profile.sections.basic.storeDescription" : "profile.sections.basic.restaurantDescription")}
        open={open.basic}
        onToggle={() => toggle("basic")}
        invalid={hasErrorIn("basic")}
      >
        {(errors.profile || errors.logo || errors.emailNotifications) && (
          <p role="alert" data-invalid className="mb-4 rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
            {t((errors.profile ?? errors.logo ?? errors.emailNotifications)!)}
          </p>
        )}
        <BasicInfoSection
          draft={draft}
          update={update}
          errors={errors}
          email={user.email}
          isStore={isStore}
          isBranch={isBranch}
          logoUrl={user.logo_url ?? ""}
          companyLogoUrl={user.company_logo_url ?? ""}
          companyDescription={user.company_description ?? ""}
        />
      </ProfileSection>

      <ProfileSection
        id={SECTION_DOM_ID.location}
        icon={MapPin}
        title={t("profile.sections.location.title")}
        description={t("profile.sections.location.description")}
        open={open.location}
        onToggle={() => toggle("location")}
        invalid={hasErrorIn("location")}
      >
        {errors.location && (
          <p role="alert" data-invalid className="mb-4 rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
            {t(errors.location)}
          </p>
        )}
        {open.location && (
          <LocationSection
            value={draft.location}
            onChange={(location) => update({ location })}
            cityCenter={city ? { latitude: city.latitude, longitude: city.longitude } : null}
            addressLine={addressLine}
          />
        )}
      </ProfileSection>

      <ProfileSection
        id={SECTION_DOM_ID.hours}
        icon={Clock}
        title={t(isStore ? "profile.sections.hours.storeTitle" : "profile.sections.hours.title")}
        description={t(isStore ? "profile.sections.hours.storeDescription" : "profile.sections.hours.description")}
        open={open.hours}
        onToggle={() => toggle("hours")}
        invalid={hasErrorIn("hours")}
      >
        <HoursSection
          isStore={isStore}
          opening={draft.openingSchedule}
          pickup={draft.pickupSchedule}
          onOpening={(openingSchedule) => update({ openingSchedule })}
          onPickup={(pickupSchedule) => update({ pickupSchedule })}
          openingError={errors.openingSchedule ? t(errors.openingSchedule) : undefined}
          pickupError={errors.pickupSchedule ? t(errors.pickupSchedule) : undefined}
        />
      </ProfileSection>

      {isStore && draft.orders && (
        <ProfileSection
          id={SECTION_DOM_ID.orders}
          icon={Truck}
          title={t("profile.sections.orders.title")}
          description={t("profile.sections.orders.description")}
          open={open.orders}
          onToggle={() => toggle("orders")}
          invalid={hasErrorIn("orders")}
        >
          <OrdersSection value={draft.orders} onChange={(orders) => update({ orders })} error={sectionError("orders")} />
        </ProfileSection>
      )}

      {isStore && (
        <ProfileSection
          id={SECTION_DOM_ID.credits}
          icon={Coins}
          title={t("profile.sections.credits.title")}
          description={t(isBranch ? "profile.sections.credits.branchDescription" : "profile.sections.credits.description")}
          open={open.credits}
          onToggle={() => toggle("credits")}
          invalid={hasErrorIn("credits")}
        >
          <CreditsSection
            value={draft.credits}
            onChange={(creditDraft) => update({ credits: creditDraft })}
            error={sectionError("credits")}
            reloadKey={creditsReload}
          />
        </ProfileSection>
      )}

      <ProfileSection
        id={SECTION_DOM_ID.password}
        icon={Lock}
        title={t("profile.sections.password.title")}
        description={t("profile.sections.password.description")}
        open={open.password}
        onToggle={() => toggle("password")}
        invalid={hasErrorIn("password")}
      >
        <PasswordSection
          value={draft.password}
          onChange={(password) => update({ password })}
          errors={errors}
          required={passwordRequired}
        />
      </ProfileSection>

      <div className="flex flex-col items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-brand-800 px-7 text-base font-bold text-white shadow-[0_6px_16px_rgba(22,101,52,0.25)] hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 disabled:cursor-wait disabled:opacity-60"
        >
          <Check className="h-5 w-5" aria-hidden="true" />
          {t("profile.header.save")}
        </button>
        <RequiredHint />
      </div>

      {confirmingPlan && draft.credits.plan && credits && (
        <SubscribeModal
          plan={draft.credits.plan}
          period={credits.subscription ? "next" : "current"}
          month={requestMonth}
          monthStarted={new Date().getDate() > 1}
          onClose={() => setConfirmingPlan(false)}
          onConfirm={(autoRenew) => save(autoRenew)}
        />
      )}
    </div>
  );
}

export default BusinessProfilePage;
