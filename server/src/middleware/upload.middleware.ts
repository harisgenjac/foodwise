import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';

const uploadDir = 'uploads/logos';
const MAX_LOGO_SIZE_MB = 5;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req: Request, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: Request, file, cb) => {
    const uniqueName = `${req.user!.id}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

class InvalidFileTypeError extends Error {}

const upload = multer({
  storage,
  limits: { fileSize: MAX_LOGO_SIZE_MB * 1024 * 1024 },
  fileFilter: (req: Request, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new InvalidFileTypeError('Dozvoljene su samo JPEG, PNG i WEBP slike.'));
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
    if (error instanceof InvalidFileTypeError) {
      return res.status(400).json({ error: error.message });
    }
    if (error) {
      return next(error);
    }
    next();
  });
};

export default upload;
