import express from 'express';
import { getUser, updateUser, getStores, getStoreDetails, uploadLogo, removeLogo, uploadCover, removeCover, changePassword, updateEmailNotifications, updateOrderSettings } from '../controllers/users.controller.js';
import { uploadCoverFile, uploadLogoFile } from '../middleware/upload.middleware.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { rateLimiters } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getUser);
router.put('/me', authenticate, updateUser);
router.put('/me/password', authenticate, rateLimiters.password, changePassword);
// Every role, admins included.
router.patch('/me/email-notifications', authenticate, updateEmailNotifications);
// A store's delivery switch, preparation time and pause on new orders.
router.patch('/me/order-settings', authenticate, authorize('STORE'), updateOrderSettings);
router.get('/stores', authenticate, authorize('RESTAURANT'), getStores);
router.get('/stores/:id', authenticate, authorize('STORE', 'RESTAURANT'), getStoreDetails);
router.post('/me/logo', authenticate, authorize('STORE', 'RESTAURANT'), rateLimiters.upload, uploadLogoFile, uploadLogo);
router.delete('/me/logo', authenticate, authorize('STORE', 'RESTAURANT'), removeLogo);
// The store page's cover image.
router.post('/me/cover', authenticate, authorize('STORE'), rateLimiters.upload, uploadCoverFile, uploadCover);
router.delete('/me/cover', authenticate, authorize('STORE'), removeCover);

export default router;