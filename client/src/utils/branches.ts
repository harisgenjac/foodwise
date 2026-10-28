import type { BranchStatus } from "../types/index.js";

// Status pills of a company's branches (headquarters and admin pages); labels in company.branchStatus.
export const BRANCH_STATUSES: BranchStatus[] = ["active", "deactivated", "blocked"];

export const BRANCH_STATUS_STYLES: Record<BranchStatus, string> = {
  active: "bg-green-50 text-green-700",
  deactivated: "bg-gray-100 text-gray-600",
  blocked: "bg-red-50 text-red-600",
};
