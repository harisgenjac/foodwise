import type { Product } from '../types/index.js';

export const PRODUCT_STATUS_STYLES: Record<Product['status'], string> = {
  Available: 'bg-success-100 text-success-800',
  Sold: 'bg-neutral-100 text-neutral-700',
  Expired: 'bg-danger-50 text-danger-700',
  Removed: 'bg-neutral-100 text-neutral-500',
};
