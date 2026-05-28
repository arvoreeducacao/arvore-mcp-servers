import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import { writeFileSync } from "node:fs";
import { getQrPngPath } from "./paths.js";

export async function renderQrToTerminal(qr: string): Promise<void> {
  return new Promise((resolve) => {
    qrcodeTerminal.generate(qr, { small: true }, (rendered) => {
      process.stderr.write(`\n${rendered}\n`);
      resolve();
    });
  });
}

export async function renderQrToPng(qr: string): Promise<string> {
  const path = getQrPngPath();
  await QRCode.toFile(path, qr, { width: 512, margin: 2 });
  return path;
}

export async function renderQrToAsciiString(qr: string): Promise<string> {
  return QRCode.toString(qr, {
    type: "terminal",
    small: true,
    errorCorrectionLevel: "M",
  });
}

export async function renderQrToDataUrl(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, { width: 512, margin: 2 });
}

export function writeQrFile(content: string, path: string): void {
  writeFileSync(path, content, "utf8");
}
