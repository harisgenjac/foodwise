import express from 'express';
import { getTemplates, saveTemplate, deleteTemplate } from '../controllers/productTemplates.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, authorize('STORE'), getTemplates);
router.post('/', authenticate, authorize('STORE'), saveTemplate);
router.delete('/:id', authenticate, authorize('STORE'), deleteTemplate);

export default router;
