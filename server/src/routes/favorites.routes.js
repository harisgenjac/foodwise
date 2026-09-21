import express from 'express';
import {addFavorite, removeFavorite, getFavorites} from '../controllers/favorites.controller.js'
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', authenticate, authorize('RESTAURANT'), addFavorite);
router.delete('/:storeId', authenticate, authorize('RESTAURANT'), removeFavorite);
router.get('/', authenticate, authorize('RESTAURANT'), getFavorites);

export default router;