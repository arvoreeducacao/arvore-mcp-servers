import { describe, expect, it } from "vitest";
import { parseContent } from "./message-content.js";

describe("parseContent", () => {
  it("reads plain and extended text", () => {
    expect(parseContent({ conversation: "oi" })?.body).toBe("oi");
    expect(parseContent({ extendedTextMessage: { text: "link aqui" } })?.body).toBe("link aqui");
  });

  it("unwraps disappearing messages", () => {
    const parsed = parseContent({
      ephemeralMessage: { message: { extendedTextMessage: { text: "some em 7 dias" } } },
    });
    expect(parsed).toMatchObject({ body: "some em 7 dias", mediaType: null });
  });

  it("unwraps view once media and keeps the caption", () => {
    const parsed = parseContent({
      viewOnceMessageV2: {
        message: { imageMessage: { mimetype: "image/jpeg", caption: "olha" } },
      },
    });
    expect(parsed).toMatchObject({ body: "[image] olha", mediaType: "image", mediaMimetype: "image/jpeg" });
  });

  it("reads documents sent with a caption", () => {
    const parsed = parseContent({
      documentWithCaptionMessage: {
        message: {
          documentMessage: { mimetype: "application/pdf", fileName: "nota.pdf", caption: "segue a nota" },
        },
      },
    });
    expect(parsed).toMatchObject({ body: "[document] nota.pdf — segue a nota", mediaType: "document" });
  });

  it("tells voice notes from audio files", () => {
    expect(parseContent({ audioMessage: { ptt: true, mimetype: "audio/ogg; codecs=opus" } })).toMatchObject({
      body: "[voice note]",
      mediaType: "voice_note",
    });
    expect(parseContent({ audioMessage: { mimetype: "audio/mpeg" } })?.mediaType).toBe("audio");
  });

  it("describes locations, contacts and polls", () => {
    expect(
      parseContent({
        locationMessage: { name: "Escola", address: "Rua A", degreesLatitude: -23.5, degreesLongitude: -46.6 },
      })?.body
    ).toBe("[location] Escola, Rua A -23.5,-46.6");
    expect(parseContent({ contactMessage: { displayName: "Ana" } })?.body).toBe("[contact] Ana");
    expect(
      parseContent({
        pollCreationMessageV3: { name: "Reunião?", options: [{ optionName: "Sim" }, { optionName: "Não" }] },
      })?.body
    ).toBe("[poll] Reunião?: Sim / Não");
  });

  it("keeps the id of the quoted message", () => {
    const parsed = parseContent({
      extendedTextMessage: { text: "isso", contextInfo: { stanzaId: "ABC123" } },
    });
    expect(parsed?.quotedMessageId).toBe("ABC123");
  });

  it("ignores reactions, protocol messages and empty content", () => {
    expect(parseContent({ reactionMessage: { text: "👍" } })).toBeNull();
    expect(parseContent({ protocolMessage: { type: 0 } })).toBeNull();
    expect(parseContent({ conversation: "" })).toBeNull();
    expect(parseContent(null)).toBeNull();
  });
});
