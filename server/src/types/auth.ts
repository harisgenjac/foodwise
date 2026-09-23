import type { JwtPayload } from 'jsonwebtoken';

export type AuthUser = JwtPayload & { id: number; role: Role };
export type Role = 'STORE' | 'RESTAURANT'