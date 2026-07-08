import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import sharp from "sharp";
import type { DiffResult } from "./types.js";

export async function compareImages(
  pageBuffer: Buffer,
  figmaBuffer: Buffer,
  threshold = 0.1
): Promise<DiffResult> {
  const pageMeta = await sharp(pageBuffer).metadata();
  const figmaMeta = await sharp(figmaBuffer).metadata();
  const targetWidth = Math.max(pageMeta.width!, figmaMeta.width!);
  const targetHeight = Math.max(pageMeta.height!, figmaMeta.height!);

  const pageResized = await sharp(pageBuffer)
    .resize(targetWidth, targetHeight, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const figmaResized = await sharp(figmaBuffer)
    .resize(targetWidth, targetHeight, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const diffRaw = Buffer.alloc(targetWidth * targetHeight * 4);

  const differentPixels = pixelmatch(
    new Uint8Array(pageResized),
    new Uint8Array(figmaResized),
    new Uint8Array(diffRaw),
    targetWidth,
    targetHeight,
    { threshold, includeAA: false, alpha: 0.3 }
  );

  const totalPixels = targetWidth * targetHeight;
  const diffPercentage = (differentPixels / totalPixels) * 100;

  const diffPng = new PNG({ width: targetWidth, height: targetHeight });
  diffPng.data = diffRaw;
  const diffImageBuffer = PNG.sync.write(diffPng);

  return {
    totalPixels,
    differentPixels,
    diffPercentage,
    diffImageBuffer,
  };
}
