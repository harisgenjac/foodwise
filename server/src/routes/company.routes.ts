import express from "express";
import { getMyCompany, updateMyCompany, uploadCompanyLogo } from "../controllers/company.controller.js";
import { uploadLogoFile } from "../middleware/upload.middleware.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

// The headquarters' own company. Every other store, restaurant and admin endpoint keeps
// rejecting the COMPANY role through its authorize list.
const router = express.Router();
router.use(authenticate, authorize("COMPANY"));

router.get("/me", getMyCompany);
router.put("/me", updateMyCompany);
router.post("/me/logo", uploadLogoFile, uploadCompanyLogo);

export default router;
