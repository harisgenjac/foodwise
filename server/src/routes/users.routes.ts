import express from 'express';
import { getUser, updateUser, getStores, getStoreDetails, uploadLogo, changePassword } from '../controllers/users.controller.js';
import { uploadLogoFile } from '../middleware/upload.middleware.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getUser);
router.put('/me', authenticate, updateUser);
router.put('/me/password', authenticate, changePassword);
router.get('/stores', authenticate, authorize('RESTAURANT'), getStores);
router.get('/stores/:id', authenticate, authorize('STORE', 'RESTAURANT'), getStoreDetails);
router.post('/me/logo', authenticate, authorize('STORE', 'RESTAURANT'), uploadLogoFile, uploadLogo);

export default router;