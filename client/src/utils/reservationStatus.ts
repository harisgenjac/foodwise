import type { Reservation } from '../types/index.js';

export const RESERVATION_STATUS_STYLES: Record<Reservation['status'], string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Confirmed: 'bg-green-50 text-green-700',
  Completed: 'bg-gray-100 text-gray-700',
  Cancelled: 'bg-red-50 text-red-600',
};
