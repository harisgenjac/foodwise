import express from 'express';
import { getUser, updateUser, getStores, getStoreDetails, uploadLogo, removeLogo, changePassword, updateEmailNotifications } from '../controllers/users.controller.js';
import { uploadLogoFile } from '../middleware/upload.middleware.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { rateLimiters } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getUser);
router.put('/me', authenticate, updateUser);
router.put('/me/password', authenticate, rateLimiters.password, changePassword);
// Every role, admins included.
router.patch('/me/email-notifications', authenticate, updateEmailNotifications);
router.get('/stores', authenticate, authorize('RESTAURANT'), getStores);
router.get('/stores/:id', authenticate, authorize('STORE', 'RESTAURANT'), getStoreDetails);
router.post('/me/logo', authenticate, authorize('STORE', 'RESTAURANT'), rateLimiters.upload, uploadLogoFile, uploadLogo);
router.delete('/me/logo', authenticate, authorize('STORE', 'RESTAURANT'), removeLogo);

export default router;