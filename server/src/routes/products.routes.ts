import express from "express";
import { createProduct, importProducts, getProducts, getProductById, getMineProducts, updateProduct, deleteProduct} from "../controllers/products.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { uploadCsvFile } from "../middleware/upload.middleware.js";
import { rateLimiters } from "../middleware/rateLimit.middleware.js";
import { getShopSales, recordShopSale } from "../controllers/shopSales.controller.js";


const router = express.Router();

router.post('/', authenticate, authorize('STORE'), createProduct);
router.post('/import', authenticate, authorize('STORE'), rateLimiters.upload, uploadCsvFile, importProducts);
router.get('/', authenticate, authorize('STORE', 'RESTAURANT'), getProducts);
router.get('/mine', authenticate, authorize('STORE'), getMineProducts);
router.put('/:id', authenticate, authorize('STORE'), updateProduct);
router.delete('/:id', authenticate, authorize('STORE'), deleteProduct);
// Sold in shop (the store's own till): record an amount, list the entries.
router.post('/:id/shop-sales', authenticate, authorize('STORE'), recordShopSale);
router.get('/:id/shop-sales', authenticate, authorize('STORE'), getShopSales);
router.get('/:id', authenticate, authorize('STORE', 'RESTAURANT'), getProductById);


export default router;