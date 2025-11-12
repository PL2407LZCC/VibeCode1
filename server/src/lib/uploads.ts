import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const resolveUploadsDir = () => {
  const configured = process.env.UPLOADS_DIR;
  if (configured && path.isAbsolute(configured)) {
    return configured;
  }

  const baseDir = process.cwd();
  const relative = configured ?? 'uploads';
  return path.resolve(baseDir, relative);
};

export const UPLOADS_DIR = resolveUploadsDir();

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
} as const;

type SupportedMimeType = keyof typeof MIME_EXTENSION_MAP;

const DEFAULT_MAX_UPLOAD_SIZE_MB = 5;

const parseMaxUploadSize = () => {
  const configured = Number.parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? '', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured * 1024 * 1024;
  }

  return DEFAULT_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
};

const safeExtensionFromFilename = (filename?: string) => {
  if (!filename) {
    return '';
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ext) {
    return '';
  }

  if (ext.length > 10) {
    return '';
  }

  return /^[.a-z0-9]+$/.test(ext) ? ext : '';
};

export const ensureUploadsDir = async () => {
  if (!existsSync(UPLOADS_DIR)) {
    await mkdir(UPLOADS_DIR, { recursive: true });
  }
};

export const toPublicUploadPath = (filename: string) => `/uploads/${filename}`;

export const ALLOWED_IMAGE_MIME_TYPES = new Set<string>(Object.keys(MIME_EXTENSION_MAP));

export const MAX_UPLOAD_SIZE_BYTES = parseMaxUploadSize();

export const createUploadFilename = (mimeType: string, originalName?: string) => {
  const mappedExtension = MIME_EXTENSION_MAP[mimeType as SupportedMimeType];
  const extension = mappedExtension ?? safeExtensionFromFilename(originalName);

  if (!extension) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return `${uniqueId}${extension}`;
};
