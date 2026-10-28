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
import { uploadLogoFile } from "../middleware/upload.middleware.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// The headquarters' own company. Every other store, restaurant and admin endpoint keeps
// rejecting the COMPANY role through its authorize list.
const router = express.Router();
router.use(authenticate, authorize("COMPANY"));

router.get("/me", getMyCompany);
router.put("/me", updateMyCompany);
router.post("/me/logo", uploadLogoFile, uploadCompanyLogo);
router.get("/branches", getBranches);
router.post("/branches", createCompanyBranch);
router.get("/branches/:id", getBranchDetails);
router.put("/branches/:id", updateCompanyBranch);
router.get("/branches/:id/products", getBranchProducts);
router.get("/branches/:id/reservations", getBranchReservations);
router.patch("/branches/:id/password", setCompanyBranchPassword);
router.post("/branches/:id/deactivate", deactivateCompanyBranch);
router.post("/branches/:id/reactivate", reactivateCompanyBranch);

export default router;
