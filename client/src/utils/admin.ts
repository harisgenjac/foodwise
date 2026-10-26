import type { Role, User } from "../types/index.js";

// Rows per page on the admin lists (the server allows up to 100).
export const ADMIN_PAGE_SIZE = 20;

export const ROLES: Role[] = ["STORE", "RESTAURANT", "ADMIN"];

export const ROLE_STYLES: Record<Role, string> = {
  STORE: "bg-orange-50 text-orange-700",
  RESTAURANT: "bg-blue-50 text-blue-700",
  ADMIN: "bg-violet-50 text-violet-700",
};

// Business name, else full name, else email: accounts created by an admin have only an email.
export const accountName = (user: Pick<User, "email" | "first_name" | "last_name" | "business_name">) =>
  user.business_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email;

// A timestamp as dd/mm/yyyy hh:mm in local time, the same in every browser language.
export const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
