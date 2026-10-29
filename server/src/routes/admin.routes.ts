import express from "express";
import {
  blockUser,
  cancelReservation,
  createAnnouncement,
  endAnnouncement,
  getAnnouncements,
  createUser,
  getAdminActions,
  getAdminDonations,
  getAdminProducts,
  getAdminReservations,
  getStats,
  getUserDetails,
  getUsers,
  removeDonation,
  removeProduct,
  resetPassword,
  unblockUser,
  updateUserProfile,
} from "../controllers/admin.controller.js";
import {
  adjustUserCredits,
  approveCreditRequest,
  getCreditOverview,
  getCreditRequests,
  getPendingRequestCount,
  getUserLedger,
  rejectCreditRequest,
} from "../controllers/adminCredits.controller.js";
import {
  blockCompany,
  createCompany,
  getCompanies,
  getCompanyDetails,
  unblockCompany,
  updateCompany,
  attachBranch,
  deactivateBranchByAdmin,
  reactivateBranchByAdmin,
} from "../controllers/adminCompanies.controller.js";
import { getPlans } from "../controllers/credits.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { rateLimiters } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
router.use(authenticate, authorize("ADMIN"));

router.get("/stats", getStats);
router.get("/users", getUsers);
router.post("/users", createUser);
router.get("/users/:id", getUserDetails);
router.patch("/users/:id/password", rateLimiters.password, resetPassword);
router.put("/users/:id/profile", updateUserProfile);
router.post("/users/:id/block", blockUser);
router.post("/users/:id/unblock", unblockUser);
router.get("/products", getAdminProducts);
router.delete("/products/:id", removeProduct);
router.get("/donations", getAdminDonations);
router.delete("/donations/:id", removeDonation);
router.get("/reservations", getAdminReservations);
router.post("/reservations/:id/cancel", cancelReservation);
router.get("/announcements", getAnnouncements);
router.post("/announcements", createAnnouncement);
router.post("/announcements/:id/end", endAnnouncement);
router.get("/actions", getAdminActions);
router.get("/companies", getCompanies);
router.post("/companies", createCompany);
router.get("/companies/:id", getCompanyDetails);
router.put("/companies/:id", updateCompany);
router.post("/companies/:id/block", blockCompany);
router.post("/companies/:id/unblock", unblockCompany);
router.post("/companies/:id/branches/attach", attachBranch);
router.post("/companies/:id/branches/:branchId/deactivate", deactivateBranchByAdmin);
router.post("/companies/:id/branches/:branchId/reactivate", reactivateBranchByAdmin);
// The active plans (the same list stores and restaurants see), for the overview's plan filter.
router.get("/credits/plans", getPlans);
router.get("/credits/overview", getCreditOverview);
router.get("/credits/requests", getCreditRequests);
router.get("/credits/requests/pending-count", getPendingRequestCount);
router.post("/credits/requests/:id/approve", approveCreditRequest);
router.post("/credits/requests/:id/reject", rejectCreditRequest);
router.get("/credits/users/:id/ledger", getUserLedger);
router.post("/credits/users/:id/adjust", adjustUserCredits);

export default router;
