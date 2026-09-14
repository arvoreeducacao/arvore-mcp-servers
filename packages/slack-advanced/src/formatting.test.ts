import { describe, it, expect } from "vitest";
import { extractMessageText, resolveFormat, toSlackText } from "./formatting.js";

describe("toSlackText in markdown mode", () => {
  it("converts markdown bold to mrkdwn bold", () => {
    expect(toSlackText("**bold**")).toContain("*bold*");
    expect(toSlackText("**bold**")).not.toContain("_bold_");
  });

  it("keeps links whose scheme is not http", () => {
    expect(toSlackText("[RFC](hive://shelf/x?tab=documento&v=1)")).toBe(
      "<hive://shelf/x?tab=documento&amp;v=1|RFC>"
    );
  });

  it("keeps a non-web link that is wrapped in bold", () => {
    expect(toSlackText("**[RFC](hive://shelf/x)**")).toContain("<hive://shelf/x|RFC>");
  });

  it("leaves mrkdwn links alone instead of double wrapping them", () => {
    expect(toSlackText("<https://github.com/a/b/pull/1|PR>")).toBe(
      "<https://github.com/a/b/pull/1|PR>"
    );
  });

  it("keeps hive links written directly in mrkdwn", () => {
    expect(toSlackText("<hive://shelf/x?tab=documento&v=1|RFC>")).toBe(
      "<hive://shelf/x?tab=documento&amp;v=1|RFC>"
    );
  });

  it("converts web markdown links", () => {
    expect(toSlackText("[PR](https://github.com/a/b/pull/1)")).toBe(
      "<https://github.com/a/b/pull/1|PR>"
    );
  });

  it("keeps paragraph breaks", () => {
    expect(toSlackText("one\n\ntwo")).toBe("one\n\ntwo");
  });

  it("does not double escape an ampersand that is already an entity", () => {
    expect(toSlackText("[RFC](hive://shelf/x?a=1&amp;b=2)")).toBe(
      "<hive://shelf/x?a=1&amp;b=2|RFC>"
    );
  });

  it("leaves user and channel mentions untouched", () => {
    expect(toSlackText("cc <@U0748LXRG48> in <#C07US58UC1Z>")).toBe(
      "cc <@U0748LXRG48> in <#C07US58UC1Z>"
    );
  });

  it("drops the trailing newline the converter adds", () => {
    expect(toSlackText("one line")).toBe("one line");
  });
});

describe("toSlackText in mrkdwn mode", () => {
  it("sends the text exactly as written", () => {
    const text = "*bold* with <hive://shelf/x?tab=doc&v=1|RFC>\n\nsecond paragraph";
    expect(toSlackText(text, "mrkdwn")).toBe(text);
  });
});

describe("resolveFormat", () => {
  it("defaults to markdown", () => {
    expect(resolveFormat()).toBe("markdown");
  });

  it("treats the legacy text/plain content type as mrkdwn", () => {
    expect(resolveFormat(undefined, "text/plain")).toBe("mrkdwn");
  });

  it("treats the legacy text/markdown content type as markdown", () => {
    expect(resolveFormat(undefined, "text/markdown")).toBe("markdown");
  });

  it("lets format win over the legacy content type", () => {
    expect(resolveFormat("markdown", "text/plain")).toBe("markdown");
  });
});

describe("extractMessageText", () => {
  it("reads the section block, which keeps the line breaks Slack strips from text", () => {
    const message = {
      text: "one  two",
      blocks: [
        { type: "context", elements: [] },
        { type: "section", block_id: "msg", text: { type: "mrkdwn", text: "one\n\ntwo" } },
      ],
    };
    expect(extractMessageText(message)).toBe("one\n\ntwo");
  });

  it("falls back to text when the message has no section block", () => {
    expect(extractMessageText({ text: "plain message" })).toBe("plain message");
  });
});
