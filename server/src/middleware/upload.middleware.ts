import multer from 'multer';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError.js';

const uploadDir = 'uploads/logos';
const MAX_LOGO_SIZE_MB = 5;

// The stored extension comes from the checked MIME type, never from the client's file name.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req: Request, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: Request, file, cb) => {
    const uniqueName = `${req.user!.id}-${Date.now()}${EXTENSIONS[file.mimetype]}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_LOGO_SIZE_MB * 1024 * 1024 },
  fileFilter: (req: Request, file, cb) => {
    if (file.mimetype in EXTENSIONS) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Dozvoljene su samo JPEG, PNG i WEBP slike.'));
    }
  },
});

// Wraps multer so that rejected uploads answer with a 400 JSON error instead of reaching the default error handler.
export const uploadLogoFile = (req: Request, res: Response, next: NextFunction) => {
  upload.single('logo')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Slika može imati najviše ${MAX_LOGO_SIZE_MB}MB.`
          : 'Slika nije ispravno poslana.';
      return res.status(400).json({ error: message });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error) {
      return next(error);
    }
    next();
  });
};

export default upload;
