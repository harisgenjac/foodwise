import express from 'express';
import { getNotifications, markAsRead } from '../controllers/notifications.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, getNotifications);
router.patch('/:id/read', authenticate, markAsRead);

export default router;