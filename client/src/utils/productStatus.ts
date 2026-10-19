import type { Product } from '../types/index.js';

export const PRODUCT_STATUS_STYLES: Record<Product['status'], string> = {
  Available: 'bg-green-50 text-green-700',
  Reserved: 'bg-amber-50 text-amber-700',
  Sold: 'bg-gray-100 text-gray-700',
  Expired: 'bg-red-50 text-red-600',
  Removed: 'bg-gray-100 text-gray-500',
};
