import express from 'express';
import { getUser, updateUser, getStores, getStoreDetails, uploadLogo } from '../controllers/users.controller.js';
import upload from '../middleware/upload.middleware.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getUser);
router.put('/me', authenticate, updateUser);
router.get('/stores', authenticate, authorize('RESTAURANT'), getStores);
router.get('/stores/:id', authenticate, getStoreDetails);
router.post('/me/logo', authenticate, upload.single('logo'), uploadLogo);

export default router;