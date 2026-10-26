import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { findFfmpeg, isOggOpus, toVoiceNote, waveformFromPcm } from "./audio.js";

function pcm(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2));
  return buffer;
}

describe("waveformFromPcm", () => {
  it("draws 64 bars scaled so the loudest one is 100", () => {
    const ramp = Array.from({ length: 6400 }, (_, index) => Math.floor(index / 100) * 100);
    const bars = waveformFromPcm(pcm(ramp));
    expect(bars).toHaveLength(64);
    expect(bars[0]).toBe(0);
    expect(bars[63]).toBe(100);
    expect([...bars]).toEqual([...bars].sort((a, b) => a - b));
  });

  it("stays flat for silence or audio shorter than the bars", () => {
    expect([...waveformFromPcm(pcm(new Array(6400).fill(0)))]).toEqual(new Array(64).fill(0));
    expect([...waveformFromPcm(pcm([1, 2, 3]))]).toEqual(new Array(64).fill(0));
  });
});

describe.skipIf(!findFfmpeg())("toVoiceNote", () => {
  let mp3: Buffer;

  beforeAll(() => {
    mp3 = execFileSync(findFfmpeg()!, [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-f", "mp3", "pipe:1",
    ]);
  });

  it("turns any audio into an Opus voice note with a waveform", async () => {
    expect(isOggOpus(mp3)).toBe(false);
    const voice = await toVoiceNote(mp3);
    expect(voice).not.toBeNull();
    expect(voice!.converted).toBe(true);
    expect(voice!.mimetype).toBe("audio/ogg; codecs=opus");
    expect(isOggOpus(voice!.buffer)).toBe(true);
    expect(Math.max(...voice!.waveform)).toBe(100);
  });

  it("keeps audio that is already Opus and only draws the waveform", async () => {
    const opus = (await toVoiceNote(mp3))!.buffer;
    const again = await toVoiceNote(opus);
    expect(again!.converted).toBe(false);
    expect(again!.buffer.equals(opus)).toBe(true);
    expect(again!.waveform).toHaveLength(64);
  });
});
