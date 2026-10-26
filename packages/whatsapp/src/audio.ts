import { execFile } from "node:child_process";
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export const VOICE_NOTE_MIMETYPE = "audio/ogg; codecs=opus";

const WAVEFORM_BARS = 64;
const WAVEFORM_SAMPLE_RATE = 8000;

export type VoiceNote = {
  buffer: Buffer;
  mimetype: string;
  waveform: Uint8Array;
  converted: boolean;
};

export function isOggOpus(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString("latin1") === "OggS" && buffer.subarray(0, 200).includes("OpusHead");
}

// GUI-launched agents often run without Homebrew on PATH.
const FALLBACK_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

let ffmpegPath: string | null | undefined;

export function findFfmpeg(): string | null {
  if (ffmpegPath !== undefined) return ffmpegPath;
  const dirs = [...(process.env.PATH ?? "").split(delimiter).filter(Boolean), ...FALLBACK_DIRS];
  ffmpegPath = null;
  for (const dir of dirs) {
    const candidate = join(dir, "ffmpeg");
    try {
      accessSync(candidate, constants.X_OK);
      ffmpegPath = candidate;
      break;
    } catch {
      continue;
    }
  }
  return ffmpegPath;
}

/**
 * Re-encodes any audio as mono Opus in Ogg, the only format every WhatsApp
 * client plays as a voice note, and draws the 64-bar waveform from the same
 * decode. Returns null when ffmpeg is not installed.
 */
export async function toVoiceNote(input: Buffer): Promise<VoiceNote | null> {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return null;

  const alreadyOpus = isOggOpus(input);
  const dir = mkdtempSync(join(tmpdir(), "whatsapp-voice-"));
  const source = join(dir, "source");
  const voice = join(dir, "voice.ogg");
  const pcm = join(dir, "waveform.pcm");

  try {
    writeFileSync(source, input);
    const encode = alreadyOpus
      ? []
      : ["-map", "0:a:0", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", voice];
    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      source,
      ...encode,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      String(WAVEFORM_SAMPLE_RATE),
      "-f",
      "s16le",
      pcm,
    ]);

    return {
      buffer: alreadyOpus ? input : readFileSync(voice),
      mimetype: VOICE_NOTE_MIMETYPE,
      waveform: waveformFromPcm(readFileSync(pcm)),
      converted: !alreadyOpus,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function waveformFromPcm(pcm: Buffer): Uint8Array {
  const samples = Math.floor(pcm.length / 2);
  const bars = new Uint8Array(WAVEFORM_BARS);
  const blockSize = Math.floor(samples / WAVEFORM_BARS);
  if (blockSize === 0) return bars;

  const averages: number[] = [];
  for (let bar = 0; bar < WAVEFORM_BARS; bar++) {
    let sum = 0;
    for (let offset = 0; offset < blockSize; offset++) {
      sum += Math.abs(pcm.readInt16LE((bar * blockSize + offset) * 2));
    }
    averages.push(sum / blockSize);
  }

  const peak = Math.max(...averages);
  if (peak === 0) return bars;
  averages.forEach((value, bar) => {
    bars[bar] = Math.floor((value / peak) * 100);
  });
  return bars;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120_000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`ffmpeg failed: ${stderr.trim() || error.message}`));
      else resolve();
    });
  });
}
