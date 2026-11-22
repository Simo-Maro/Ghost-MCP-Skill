import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestMcp, jsonResponse, verifyGhostJwt } from './helpers/mcp-harness.js';

let tempDir: string;
let outsideDir: string;
let largePngPath: string;
let exifJpegPath: string;
let avifPath: string;
let svgPath: string;
let animatedGifPath: string;
let icoPath: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ghost-mcp-media-'));
  outsideDir = await mkdtemp(join(tmpdir(), 'ghost-mcp-outside-'));

  // 1. Large PNG (2200x1100)
  largePngPath = join(tempDir, 'hero-raw.png');
  await sharp({
    create: { width: 2200, height: 1100, channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } },
  })
    .png()
    .toFile(largePngPath);

  // 2. JPEG with EXIF metadata
  exifJpegPath = join(tempDir, 'photo-exif.jpg');
  await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .withExif({ IFD0: { Artist: 'Secret Camera User', Make: 'TestCam' } })
    .jpeg()
    .toFile(exifJpegPath);

  // 3. Real AVIF
  avifPath = join(tempDir, 'modern-shot.avif');
  await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 40, g: 180, b: 90 } },
  })
    .avif()
    .toFile(avifPath);

  // 4. SVG
  svgPath = join(tempDir, 'diagram.svg');
  await writeFile(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>',
    'utf8',
  );

  // 5. Multi-frame animated GIF (2 distinct 32x32 frames: red then blue)
  animatedGifPath = join(tempDir, 'spinner.gif');
  const framePixels = Buffer.alloc(32 * 64 * 4);
  for (let i = 0; i < 32 * 32; i++) {
    framePixels[i * 4] = 255; // R
    framePixels[i * 4 + 3] = 255; // A
  }
  for (let i = 32 * 32; i < 32 * 64; i++) {
    framePixels[i * 4 + 2] = 255; // B
    framePixels[i * 4 + 3] = 255; // A
  }
  await sharp(framePixels, {
    raw: { width: 32, height: 64, channels: 4, pageHeight: 32 },
  })
    .gif({ delay: [100, 100] })
    .toFile(animatedGifPath);

  // 6. Minimal valid ICO header
  icoPath = join(tempDir, 'favicon.ico');
  const icoBytes = Buffer.from([
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  await writeFile(icoPath, icoBytes);
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
});

async function extractUploadedFile(body: RequestInit['body']) {
  expect(body).toBeInstanceOf(FormData);
  const fd = body as FormData;
  const file = fd.get('file');
  expect(file).toBeInstanceOf(Blob);
  const blob = file as File;
  const bytes = Buffer.from(await blob.arrayBuffer());
  return {
    bytes,
    name: blob.name,
    type: blob.type,
    purpose: fd.get('purpose'),
    ref: fd.get('ref'),
  };
}

describe('upload_image media pipeline (real fixtures + real sharp)', () => {
  it('converts and downscales a 2200px PNG to 1600px WebP with SEO filename override', async () => {
    let uploaded: Awaited<ReturnType<typeof extractUploadedFile>> | undefined;
    const ctx = await connectTestMcp({}, async (req) => {
      verifyGhostJwt(req.headers.get('authorization'));
      expect(req.headers.get('accept-version')).toBe('v6.0');
      expect(req.headers.get('content-type')).toBeNull();
      uploaded = await extractUploadedFile(req.body);
      return jsonResponse({
        images: [{ url: 'https://example.ghost.test/content/images/seo-hero.webp', ref: 'ref-1' }],
      });
    });

    try {
      const res = await ctx.client.callTool({
        name: 'upload_image',
        arguments: {
          filePath: largePngPath,
          filename: 'SEO Hero Image.png',
          ref: 'ref-1',
        },
      });
      expect(res.isError).toBeFalsy();
      expect(uploaded).toBeDefined();
      expect(uploaded?.name).toBe('seo-hero-image.webp');
      expect(uploaded?.type).toBe('image/webp');
      expect(uploaded?.purpose).toBe('image');
      expect(uploaded?.ref).toBe('ref-1');

      const outMeta = await sharp(uploaded!.bytes).metadata();
      expect(outMeta.format).toBe('webp');
      expect(outMeta.width).toBe(1600);
      expect(outMeta.height).toBe(800);
    } finally {
      await ctx.close();
    }
  });

  it('strips EXIF metadata from JPEG and honors maxWidth/quality overrides', async () => {
    let uploadedBytes: Buffer | undefined;
    const ctx = await connectTestMcp({}, async (req) => {
      const file = await extractUploadedFile(req.body);
      uploadedBytes = file.bytes;
      return jsonResponse({
        images: [{ url: 'https://example.ghost.test/content/images/photo.webp', ref: null }],
      });
    });

    try {
      const res = await ctx.client.callTool({
        name: 'upload_image',
        arguments: {
          filePath: exifJpegPath,
          maxWidth: 400,
          quality: 65,
        },
      });
      expect(res.isError).toBeFalsy();
      const meta = await sharp(uploadedBytes!).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(400);
      expect(meta.exif).toBeUndefined();
    } finally {
      await ctx.close();
    }
  });

  it('auto-converts .avif to WebP when optimize=true, and rejects raw .avif when optimize=false', async () => {
    let uploadedName = '';
    const ctx = await connectTestMcp({}, async (req) => {
      const file = await extractUploadedFile(req.body);
      uploadedName = file.name;
      return jsonResponse({
        images: [{ url: 'https://example.ghost.test/content/images/modern-shot.webp', ref: null }],
      });
    });

    try {
      const okRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: avifPath },
      });
      expect(okRes.isError).toBeFalsy();
      expect(uploadedName).toBe('modern-shot.webp');

      const rawRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: avifPath, optimize: false },
      });
      expect(rawRes.isError).toBe(true);
      const text = (rawRes.content as Array<{ text?: string }>)[0]?.text ?? '';
      expect(text).toMatch(/\.avif/i);
    } finally {
      await ctx.close();
    }
  });

  it('passes through SVG, multi-frame animated GIF, and ICO (for purpose="icon") untouched', async () => {
    const uploads: Array<{ name: string; type: string; bytes: Buffer }> = [];
    const ctx = await connectTestMcp({}, async (req) => {
      const file = await extractUploadedFile(req.body);
      uploads.push({ name: file.name, type: file.type, bytes: file.bytes });
      return jsonResponse({
        images: [{ url: `https://example.ghost.test/content/images/${file.name}`, ref: null }],
      });
    });

    try {
      const svgRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: svgPath },
      });
      expect(svgRes.isError).toBeFalsy();
      expect((svgRes.structuredContent as { optimized: boolean; passthroughReason: string }).optimized).toBe(false);
      expect((svgRes.structuredContent as { passthroughReason: string }).passthroughReason).toBe('svg_passthrough');

      const gifRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: animatedGifPath },
      });
      expect(gifRes.isError).toBeFalsy();
      expect((gifRes.structuredContent as { optimized: boolean }).optimized).toBe(false);
      expect((gifRes.structuredContent as { passthroughReason: string }).passthroughReason).toBe(
        'animated_gif_passthrough',
      );

      const icoOk = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: icoPath, purpose: 'icon' },
      });
      expect(icoOk.isError).toBeFalsy();

      const icoBadPurpose = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: icoPath, purpose: 'image' },
      });
      expect(icoBadPurpose.isError).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('enforces directory check, 50 MB size cap, and GHOST_UPLOAD_ROOT jail', async () => {
    const outsideFile = join(outsideDir, 'escape.svg');
    await writeFile(outsideFile, '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

    const oversizedFile = join(tempDir, 'huge.png');
    const fh = await open(oversizedFile, 'w');
    try {
      await fh.truncate(50 * 1024 * 1024 + 1024);
    } finally {
      await fh.close();
    }

    const ctx = await connectTestMcp({ uploadRoot: tempDir });
    try {
      const dirRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: tempDir },
      });
      expect(dirRes.isError).toBe(true);

      const bigRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: oversizedFile },
      });
      expect(bigRes.isError).toBe(true);
      const bigText = (bigRes.content as Array<{ text?: string }>)[0]?.text ?? '';
      expect(bigText).toMatch(/50 MB/i);

      const escapeRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: outsideFile },
      });
      expect(escapeRes.isError).toBe(true);
      const text = (escapeRes.content as Array<{ text?: string }>)[0]?.text ?? '';
      expect(text).toMatch(/GHOST_UPLOAD_ROOT/i);
    } finally {
      await ctx.close();
    }
  });

  it('boots without loading sharp and returns actionable guidance when lazy sharp import fails', async () => {
    let sharpLoadAttempts = 0;
    const ctx = await connectTestMcp(
      {},
      () => jsonResponse({ images: [{ url: 'https://example.ghost.test/x.png', ref: null }] }),
      {
        loadSharp: async () => {
          sharpLoadAttempts += 1;
          throw new Error('Could not load sharp native binary');
        },
      },
    );

    try {
      // Listing tools must not load sharp
      await ctx.client.listTools();
      expect(sharpLoadAttempts).toBe(0);

      // SVG passthrough must not load sharp
      const svgRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: svgPath },
      });
      expect(svgRes.isError).toBeFalsy();
      expect(sharpLoadAttempts).toBe(0);

      // Raster with optimize=true triggers lazy sharp load and surfaces actionable error
      const failRes = await ctx.client.callTool({
        name: 'upload_image',
        arguments: { filePath: largePngPath, optimize: true },
      });
      expect(sharpLoadAttempts).toBe(1);
      expect(failRes.isError).toBe(true);
      const text = (failRes.content as Array<{ text?: string }>)[0]?.text ?? '';
      expect(text).toMatch(/optimize:\s*false/i);
    } finally {
      await ctx.close();
    }
  });
});
