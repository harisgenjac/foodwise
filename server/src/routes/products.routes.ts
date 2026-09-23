import express from "express";
import { createProduct, getProducts, getProductById, getMineProducts, updateProduct, deleteProduct} from "../controllers/products.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";


const router = express.Router();

router.post('/', authenticate, authorize('STORE'), createProduct);
router.get('/', authenticate, getProducts);
router.get('/mine', authenticate, authorize('STORE'), getMineProducts);
router.put('/:id', authenticate, authorize('STORE'), updateProduct);
router.delete('/:id', authenticate, authorize('STORE'), deleteProduct);
router.get('/:id', authenticate, getProductById);


export default router;