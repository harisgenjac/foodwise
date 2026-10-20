import multer from 'multer';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

const uploadDir = 'uploads/logos';
const MAX_LOGO_SIZE_MB = 5;
export const MAX_CSV_SIZE_MB = 1;

// The stored extension comes from the checked MIME type, never from the client's file name.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Browsers and operating systems disagree on the type of a .csv file (Excel on Windows sends vnd.ms-excel).
const CSV_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
];

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

// CSV imports are parsed straight from memory and never written to disk.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_SIZE_MB * 1024 * 1024 },
  fileFilter: (req: Request, file, cb) => {
    if (
      path.extname(file.originalname).toLowerCase() === '.csv' &&
      CSV_MIME_TYPES.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Dozvoljeni su samo CSV fajlovi.'));
    }
  },
});

// Wraps multer so that rejected uploads answer with a 400 JSON error instead of reaching the default error handler.
const handleUpload =
  (handler: RequestHandler, tooLargeMessage: string, invalidMessage: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE' ? tooLargeMessage : invalidMessage;
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

export const uploadLogoFile = handleUpload(
  upload.single('logo'),
  `Slika može imati najviše ${MAX_LOGO_SIZE_MB}MB.`,
  'Slika nije ispravno poslana.',
);

export const uploadCsvFile = handleUpload(
  csvUpload.single('file'),
  `Fajl može imati najviše ${MAX_CSV_SIZE_MB}MB.`,
  'Fajl nije ispravno poslan.',
);

export default upload;
