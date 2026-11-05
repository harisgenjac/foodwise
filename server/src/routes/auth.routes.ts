import express from "express";
import { register, login, logout, me } from "../controllers/auth.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { rateLimiters } from "../middleware/rateLimit.middleware.js";
import { checkResetToken, forgotPassword, resetPassword } from "../controllers/password.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", rateLimiters.login, login);
router.post("/logout", logout);
router.get("/me", authenticate, me);
// Without a session: the emailed one-time links (see password.controller.ts).
router.post("/forgot-password", rateLimiters.forgotPassword, forgotPassword);
router.post("/reset-password/check", checkResetToken);
router.post("/reset-password", resetPassword);

export default router;
