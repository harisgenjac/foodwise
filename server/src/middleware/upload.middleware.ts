import multer from 'multer';
import path from 'path';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';
import { IMAGE_EXTENSIONS } from '../services/storage.js';

export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_CSV_SIZE_MB = 1;

// Browsers and operating systems disagree on the type of a .csv file (Excel on Windows sends vnd.ms-excel).
const CSV_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
];

// Images are checked here (type and size) and kept in memory; the controller hands them to
// services/storage.ts, the one place that knows where files are stored.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req: Request, file, cb) => {
    if (file.mimetype in IMAGE_EXTENSIONS) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Only JPEG, PNG and WEBP images are allowed.'));
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
      cb(new HttpError(400, 'Only CSV files are allowed.'));
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

const uploadImageFile = (field: string) =>
  handleUpload(
    imageUpload.single(field),
    `The image can be at most ${MAX_IMAGE_SIZE_MB}MB.`,
    'The image was not uploaded correctly.',
  );

export const uploadLogoFile = uploadImageFile('logo');
export const uploadProductImageFile = uploadImageFile('image');

export const uploadCsvFile = handleUpload(
  csvUpload.single('file'),
  `The file can be at most ${MAX_CSV_SIZE_MB}MB.`,
  'The file was not uploaded correctly.',
);
