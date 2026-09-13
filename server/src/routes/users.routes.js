import express from 'express';
import { getUser, updateUser } from '../controllers/users.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getUser);
router.put('/me', authenticate, updateUser);

export default router;