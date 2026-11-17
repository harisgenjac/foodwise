import express from 'express';
import { streamEvents } from '../controllers/events.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, streamEvents);

export default router;
