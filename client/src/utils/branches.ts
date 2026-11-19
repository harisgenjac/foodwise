import type { BranchStatus } from "../types/index.js";

// Status pills of a company's branches (headquarters and admin pages); labels in company.branchStatus.
export const BRANCH_STATUSES: BranchStatus[] = ["active", "deactivated", "blocked"];

export const BRANCH_STATUS_STYLES: Record<BranchStatus, string> = {
  active: "bg-brand-50 text-brand-800",
  deactivated: "bg-neutral-100 text-neutral-600",
  blocked: "bg-danger-50 text-danger-700",
};
