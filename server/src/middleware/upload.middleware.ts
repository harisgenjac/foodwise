import multer from 'multer';
import fs from 'fs';
import type { Request } from 'express';
import { HttpError } from '../utils/httpError.js';

const uploadDir = 'uploads/logos';

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req: Request, file, cb) => {
    if (file.mimetype in EXTENSIONS) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Dozvoljene su samo JPEG, PNG i WEBP slike.'));
    }
  },
});

export default upload;
