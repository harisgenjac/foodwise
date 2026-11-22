import type { GeoPoint, Plan, TopupPackage, User } from "../../types/index.js";
import { isScheduleValid, type Schedule } from "../../utils/schedule.js";

// The whole My profile page of a restaurant or a store in one place: what is shown and edited
// (`ProfileDraft`), and what was last saved (the same shape). Nothing is sent until "Sačuvaj
// izmjene"; comparing the two tells whether anything changed.

export const MIN_PASSWORD_LENGTH = 8;

export type SectionId = "basic" | "location" | "hours" | "orders" | "credits" | "password";

export interface OrderDraft {
  delivery_enabled: boolean;
  preparation_minutes: number;
  orders_paused: boolean;
  orders_paused_until: string | null;
}

// Credit choices made on the page and sent on save. `autoRenew` is null without a subscription.
export interface CreditDraft {
  autoRenew: boolean | null;
  plan: Plan | null;
  topup: TopupPackage | null;
  withdraw: number[];
}

export interface PasswordDraft {
  current: string;
  next: string;
  repeat: string;
}

export interface ProfileDraft {
  businessName: string;
  firstName: string;
  lastName: string;
  phone: string;
  cityId: string;
  address: string;
  description: string;
  emailNotifications: boolean;
  location: GeoPoint | null;
  openingSchedule: Schedule | null;
  pickupSchedule: Schedule | null;
  // A logo chosen on the page (uploaded on save). A logo cannot be removed, only replaced.
  logoFile: File | null;
  // A store's order settings; null for a restaurant.
  orders: OrderDraft | null;
  credits: CreditDraft;
  password: PasswordDraft;
}

export const EMPTY_PASSWORD: PasswordDraft = { current: "", next: "", repeat: "" };
export const EMPTY_CREDITS: CreditDraft = { autoRenew: null, plan: null, topup: null, withdraw: [] };

export const draftFromUser = (user: User, autoRenew: boolean | null): ProfileDraft => ({
  businessName: user.business_name ?? "",
  firstName: user.first_name ?? "",
  lastName: user.last_name ?? "",
  phone: user.phone ?? "",
  cityId: user.city_id ? String(user.city_id) : "",
  address: user.address ?? "",
  description: user.description ?? "",
  emailNotifications: user.email_notifications ?? true,
  location: user.latitude != null && user.longitude != null ? { latitude: user.latitude, longitude: user.longitude } : null,
  openingSchedule: user.opening_schedule ?? null,
  pickupSchedule: user.pickup_schedule ?? null,
  logoFile: null,
  orders:
    user.role === "STORE"
      ? {
          delivery_enabled: user.delivery_enabled ?? true,
          preparation_minutes: user.preparation_minutes ?? 30,
          orders_paused: user.orders_paused ?? false,
          orders_paused_until: user.orders_paused_until ?? null,
        }
      : null,
  credits: { ...EMPTY_CREDITS, autoRenew },
  password: EMPTY_PASSWORD,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Which parts differ from the saved state; the save sends only those.
export const changes = (draft: ProfileDraft, saved: ProfileDraft) => ({
  profile: !same(
    [draft.businessName, draft.firstName, draft.lastName, draft.phone, draft.cityId, draft.address, draft.description,
      draft.location, draft.openingSchedule, draft.pickupSchedule],
    [saved.businessName, saved.firstName, saved.lastName, saved.phone, saved.cityId, saved.address, saved.description,
      saved.location, saved.openingSchedule, saved.pickupSchedule],
  ),
  logo: draft.logoFile !== null,
  emailNotifications: draft.emailNotifications !== saved.emailNotifications,
  orders: !same(draft.orders, saved.orders),
  autoRenew: draft.credits.autoRenew !== saved.credits.autoRenew,
  plan: draft.credits.plan !== null,
  topup: draft.credits.topup !== null,
  withdraw: draft.credits.withdraw.length > 0,
  password: Boolean(draft.password.current || draft.password.next || draft.password.repeat),
});

export const hasChanges = (draft: ProfileDraft, saved: ProfileDraft) =>
  Object.values(changes(draft, saved)).some(Boolean);

// A field's error as an i18n key, or a server message (already in the user's language).
export type ProfileErrors = Partial<Record<string, string>>;

// The section each field lives in, so a save with errors opens it.
export const FIELD_SECTION: Record<string, SectionId> = {
  businessName: "basic",
  firstName: "basic",
  lastName: "basic",
  phone: "basic",
  city: "basic",
  address: "basic",
  logo: "basic",
  location: "location",
  openingSchedule: "hours",
  pickupSchedule: "hours",
  orders: "orders",
  credits: "credits",
  current: "password",
  next: "password",
  repeat: "password",
  profile: "basic",
};

// Checks everything before a save. `isBranch`: a branch's name and city are its company's.
// `passwordRequired`: a temporary password must be replaced.
export const validateDraft = (
  draft: ProfileDraft,
  { isBranch, isStore, passwordRequired }: { isBranch: boolean; isStore: boolean; passwordRequired: boolean },
): ProfileErrors => {
  const errors: ProfileErrors = {};
  const required = (field: string, value: string) => {
    if (value.trim() === "") errors[field] = "common.fieldRequired";
  };
  if (!isBranch) required("businessName", draft.businessName);
  required("firstName", draft.firstName);
  required("lastName", draft.lastName);
  required("phone", draft.phone);
  if (!isBranch) required("city", draft.cityId);
  required("address", draft.address);
  if (!isScheduleValid(draft.openingSchedule)) errors.openingSchedule = "schedule.invalid";
  if (isStore && !isScheduleValid(draft.pickupSchedule)) errors.pickupSchedule = "schedule.invalid";

  const { current, next, repeat } = draft.password;
  if (passwordRequired || current || next || repeat) {
    if (!current) errors.current = "common.fieldRequired";
    if (!next) errors.next = "common.fieldRequired";
    else if (next.length < MIN_PASSWORD_LENGTH) errors.next = "profile.password.tooShort";
    if (!repeat) errors.repeat = "common.fieldRequired";
    else if (repeat !== next) errors.repeat = "user.passwordMismatch";
  }
  return errors;
};
