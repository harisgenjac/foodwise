import type { JwtPayload } from 'jsonwebtoken';
import type { AuthUser } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      file?: Express.Multer.File;
    }
  }
}

export {};