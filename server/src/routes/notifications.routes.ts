import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
} from '../controllers/notifications.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, getNotifications);
// Static paths before the /:id ones.
router.patch('/read-all', authenticate, markAllAsRead);
router.delete('/read', authenticate, deleteReadNotifications);
router.patch('/:id/read', authenticate, markAsRead);
router.delete('/:id', authenticate, deleteNotification);

export default router;
