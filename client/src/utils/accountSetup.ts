import type { Role, User } from "../types/index.js";

// Profile fields a store or restaurant must fill in before using the app (the server requires
// the same ones when the profile is saved). A company headquarters login needs a name and a
// phone; an admin only needs a name, set on the profile page (not enforced by the lock).
export const REQUIRED_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "business_name",
  "city",
  "phone",
  "address",
] as const;

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

const REQUIRED_FIELDS_BY_ROLE: Record<Role, readonly RequiredProfileField[]> = {
  STORE: REQUIRED_PROFILE_FIELDS,
  RESTAURANT: REQUIRED_PROFILE_FIELDS,
  COMPANY: ["first_name", "last_name", "phone"],
  ADMIN: [],
};

export interface AccountSetup {
  // The admin set a temporary password that the user has not replaced yet.
  needsPassword: boolean;
  missingFields: RequiredProfileField[];
  locked: boolean;
}

export const getAccountSetup = (user: User | null): AccountSetup => {
  if (!user) return { needsPassword: false, missingFields: [], locked: false };
  const needsPassword = Boolean(user.must_change_password);
  const missingFields = REQUIRED_FIELDS_BY_ROLE[user.role].filter((field) => !String(user[field] ?? "").trim());
  return { needsPassword, missingFields, locked: needsPassword || missingFields.length > 0 };
};
