import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import type sharpNamespace from 'sharp';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
export const DEFAULT_MAX_WIDTH = 1600;
export const DEFAULT_WEBP_QUALITY = 82;

export type ImagePurpose = 'image' | 'profile_image' | 'icon';
export type SharpLoader = () => Promise<{ default: typeof sharpNamespace }>;

export interface PrepareImageOptions {
  filePath: string;
  purpose?: ImagePurpose;
  filename?: string;
  optimize?: boolean;
  maxWidth?: number;
  quality?: number;
  uploadRoot?: string;
  loadSharp?: SharpLoader;
}

export interface PreparedImage {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  optimized: boolean;
  passthroughReason?: string;
  originalBytes: number;
  finalBytes: number;
  width?: number;
  height?: number;
}

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

type DetectedFormat = 'svg' | 'ico' | 'avif' | 'gif' | 'webp' | 'png' | 'jpeg' | 'tiff' | 'unknown';

const FORMAT_META: Record<
  Exclude<DetectedFormat, 'unknown'>,
  { mime: string; ext: string }
> = {
  svg: { mime: 'image/svg+xml', ext: '.svg' },
  ico: { mime: 'image/x-icon', ext: '.ico' },
  avif: { mime: 'image/avif', ext: '.avif' },
  gif: { mime: 'image/gif', ext: '.gif' },
  webp: { mime: 'image/webp', ext: '.webp' },
  png: { mime: 'image/png', ext: '.png' },
  jpeg: { mime: 'image/jpeg', ext: '.jpg' },
  tiff: { mime: 'image/tiff', ext: '.tiff' },
};

function detectFormat(buffer: Buffer, filePath: string): DetectedFormat {
  // Check magic bytes first
  if (buffer.length >= 4) {
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpeg';
    }
    // GIF: GIF87a / GIF89a
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return 'gif';
    }
    // ICO: 00 00 01 00
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
      return 'ico';
    }
    // TIFF: II*\0 or MM\0*
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      return 'tiff';
    }
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  // AVIF: ....ftypavif / ftypavis
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
      const headAscii = buffer.subarray(0, Math.min(buffer.length, 32)).toString('ascii');
      if (headAscii.includes('avif') || headAscii.includes('avis')) {
        return 'avif';
      }
    }
  }

  // SVG: XML/text starting with <svg or <?xml ... <svg
  const headText = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(headText)) {
    return 'svg';
  }

  // Fallback to extension
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.svg':
      return 'svg';
    case '.ico':
      return 'ico';
    case '.avif':
      return 'avif';
    case '.gif':
      return 'gif';
    case '.webp':
      return 'webp';
    case '.png':
      return 'png';
    case '.jpg':
    case '.jpeg':
      return 'jpeg';
    case '.tif':
    case '.tiff':
      return 'tiff';
    default:
      return 'unknown';
  }
}

function sanitizeFilename(name: string, targetExt: string): string {
  const base = basename(name);
  const currentExt = extname(base);
  const stem = (currentExt ? base.slice(0, -currentExt.length) : base)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  return `${stem}${targetExt}`;
}

export async function prepareImageForUpload(
  options: PrepareImageOptions,
): Promise<PreparedImage> {
  const purpose: ImagePurpose = options.purpose ?? 'image';
  const optimize = options.optimize ?? true;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;

  const resolvedPath = resolve(options.filePath);

  if (options.uploadRoot) {
    const resolvedRoot = await realpath(options.uploadRoot).catch(() => resolve(options.uploadRoot!));
    let realTarget: string;
    try {
      realTarget = await realpath(resolvedPath);
    } catch {
      throw new MediaValidationError(`File not found or inaccessible: "${options.filePath}".`);
    }
    const rel = relative(resolvedRoot, realTarget);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new MediaValidationError(
        `File path "${options.filePath}" is outside the allowed GHOST_UPLOAD_ROOT directory.`,
      );
    }
  }

  let fileStats;
  try {
    fileStats = await stat(resolvedPath);
  } catch {
    throw new MediaValidationError(`File not found or inaccessible: "${options.filePath}".`);
  }

  if (!fileStats.isFile()) {
    throw new MediaValidationError(
      `Path "${options.filePath}" is not a regular file. Provide a path to an image file.`,
    );
  }

  if (fileStats.size === 0) {
    throw new MediaValidationError(`File "${options.filePath}" is empty (0 bytes).`);
  }

  if (fileStats.size > MAX_UPLOAD_BYTES) {
    throw new MediaValidationError(
      `File "${options.filePath}" (${(fileStats.size / (1024 * 1024)).toFixed(1)} MB) exceeds Ghost's 50 MB upload limit.`,
    );
  }

  const rawBuffer = await readFile(resolvedPath);
  const detected = detectFormat(rawBuffer, resolvedPath);
  const desiredName = options.filename ?? basename(resolvedPath);

  if (detected === 'unknown') {
    throw new MediaValidationError(
      `Unsupported or unrecognized image format for "${options.filePath}". Supported inputs: JPEG, PNG, WebP, GIF, SVG, AVIF (auto-converted to WebP), TIFF, and ICO (for purpose="icon").`,
    );
  }

  if (detected === 'ico' && purpose !== 'icon') {
    throw new MediaValidationError(
      'ICO files are only accepted by Ghost when purpose is "icon". Use purpose="icon" or provide a WebP/PNG/JPEG/SVG image.',
    );
  }

  // Raw passthrough mode (optimize: false)
  if (!optimize) {
    if (detected === 'avif') {
      throw new MediaValidationError(
        'Ghost Admin API rejects raw .avif uploads. Retry with optimize: true (the default) to automatically convert AVIF to WebP.',
      );
    }
    if (detected === 'tiff') {
      throw new MediaValidationError(
        'Ghost Admin API rejects raw .tiff uploads. Retry with optimize: true (the default) to automatically convert TIFF to WebP.',
      );
    }
    const meta = FORMAT_META[detected];
    return {
      buffer: rawBuffer,
      filename: sanitizeFilename(desiredName, meta.ext),
      mimeType: meta.mime,
      optimized: false,
      passthroughReason: 'optimize=false',
      originalBytes: rawBuffer.length,
      finalBytes: rawBuffer.length,
    };
  }

  // Passthrough SVG and ICO without touching sharp
  if (detected === 'svg' || detected === 'ico') {
    const meta = FORMAT_META[detected];
    return {
      buffer: rawBuffer,
      filename: sanitizeFilename(desiredName, meta.ext),
      mimeType: meta.mime,
      optimized: false,
      passthroughReason: `${detected}_passthrough`,
      originalBytes: rawBuffer.length,
      finalBytes: rawBuffer.length,
    };
  }

  // Lazy-load sharp only when optimization is actually needed
  const loadSharp: SharpLoader =
    options.loadSharp ?? (() => import('sharp') as Promise<{ default: typeof sharpNamespace }>);

  let sharpFn: typeof sharpNamespace;
  try {
    const mod = await loadSharp();
    sharpFn = mod.default;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new MediaValidationError(
      `Failed to load native image optimizer ("sharp"): ${reason}. Retry upload_image with optimize: false to upload Ghost-compatible files (JPEG, PNG, WebP, GIF, SVG) directly without optimization.`,
    );
  }

  // Check for multi-frame animated GIF or WebP
  if (detected === 'gif' || detected === 'webp') {
    const metaInfo = await sharpFn(rawBuffer, { animated: true }).metadata();
    if ((metaInfo.pages ?? 1) > 1) {
      const meta = FORMAT_META[detected];
      return {
        buffer: rawBuffer,
        filename: sanitizeFilename(desiredName, meta.ext),
        mimeType: meta.mime,
        optimized: false,
        passthroughReason: `animated_${detected}_passthrough`,
        originalBytes: rawBuffer.length,
        finalBytes: rawBuffer.length,
        width: metaInfo.width,
        height: metaInfo.pageHeight ?? metaInfo.height,
      };
    }
  }

  // Static raster optimization -> WebP (downscale-only, auto-orient, EXIF stripped by default)
  const { data: optimizedBuffer, info } = await sharpFn(rawBuffer)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: optimizedBuffer,
    filename: sanitizeFilename(desiredName, '.webp'),
    mimeType: 'image/webp',
    optimized: true,
    originalBytes: rawBuffer.length,
    finalBytes: optimizedBuffer.length,
    width: info.width,
    height: info.height,
  };
}
