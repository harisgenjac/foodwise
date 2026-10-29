import express from "express";
import { getMyCompany, updateMyCompany, uploadCompanyLogo } from "../controllers/company.controller.js";
import {
  createCompanyBranch,
  deactivateCompanyBranch,
  getBranchDetails,
  getBranchProducts,
  getBranchReservations,
  getBranches,
  reactivateCompanyBranch,
  setCompanyBranchPassword,
  updateCompanyBranch,
} from "../controllers/companyBranches.controller.js";
import {
  approveBranchTopupRequest,
  createBranchRequest,
  getBranchCredits,
  getBranchTopupRequestCount,
  getBranchTopupRequests,
  getCompanyCreditRequests,
  getCompanyCredits,
  rejectBranchTopupRequest,
  setBranchAutoRenew,
  withdrawBranchRequest,
} from "../controllers/companyCredits.controller.js";
import { getCompanyDashboard } from "../controllers/companyDashboard.controller.js";
import {
  getCompanyBranchesReport,
  getCompanyImpactReport,
  getCompanySalesReport,
} from "../controllers/companyReports.controller.js";
import { getPlans, getTopupPackages } from "../controllers/credits.controller.js";
import { uploadLogoFile } from "../middleware/upload.middleware.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { rateLimiters } from "../middleware/rateLimit.middleware.js";

// The headquarters' own company. Every other store, restaurant and admin endpoint keeps
// rejecting the COMPANY role through its authorize list.
const router = express.Router();
router.use(authenticate, authorize("COMPANY"));

router.get("/dashboard", getCompanyDashboard);
router.get("/me", getMyCompany);
router.put("/me", updateMyCompany);
router.post("/me/logo", rateLimiters.upload, uploadLogoFile, uploadCompanyLogo);
router.get("/branches", getBranches);
router.post("/branches", createCompanyBranch);
router.get("/branches/:id", getBranchDetails);
router.put("/branches/:id", updateCompanyBranch);
router.get("/branches/:id/products", getBranchProducts);
router.get("/branches/:id/reservations", getBranchReservations);
router.patch("/branches/:id/password", rateLimiters.password, setCompanyBranchPassword);
router.post("/branches/:id/deactivate", deactivateCompanyBranch);
router.post("/branches/:id/reactivate", reactivateCompanyBranch);
router.get("/branches/:id/credits", getBranchCredits);
router.post("/branches/:id/credits/requests", createBranchRequest);
router.delete("/branches/:id/credits/requests/:requestId", withdrawBranchRequest);
router.patch("/branches/:id/credits/auto-renew", setBranchAutoRenew);
router.get("/credits", getCompanyCredits);
router.get("/credits/plans", getPlans);
router.get("/credits/topup-packages", getTopupPackages);
router.get("/credits/requests", getCompanyCreditRequests);
router.get("/credits/branch-requests", getBranchTopupRequests);
router.get("/credits/branch-requests/count", getBranchTopupRequestCount);
router.post("/credits/branch-requests/:id/approve", approveBranchTopupRequest);
router.post("/credits/branch-requests/:id/reject", rejectBranchTopupRequest);
router.get("/reports/sales", getCompanySalesReport);
router.get("/reports/impact", getCompanyImpactReport);
router.get("/reports/branches", getCompanyBranchesReport);

export default router;
