import { describe, it, expect } from "vitest";
import { markdownToRichText } from "./rich-text.js";

const elements = (markdown: string): Array<Record<string, unknown>> =>
  (markdownToRichText(markdown)[0]?.elements ?? []) as Array<Record<string, unknown>>;

describe("markdownToRichText", () => {
  it("wraps everything in a single rich_text block", () => {
    const blocks = markdownToRichText("hello");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("rich_text");
  });

  it("marks bold text with a bold style", () => {
    const [section] = elements("**bold** rest");
    expect(section.elements).toEqual([
      { type: "text", text: "bold", style: { bold: true } },
      { type: "text", text: " rest" },
    ]);
  });

  it("keeps italic, strike and inline code as styles", () => {
    const [section] = elements("*i* ~~s~~ `c`");
    const styles = (section.elements as Array<{ style?: Record<string, boolean> }>)
      .map((element) => element.style)
      .filter(Boolean);
    expect(styles).toEqual([{ italic: true }, { strike: true }, { code: true }]);
  });

  it("turns a markdown link into a link element", () => {
    const [section] = elements("[PR](https://example.com/1)");
    expect(section.elements).toEqual([
      { type: "link", url: "https://example.com/1", text: "PR" },
    ]);
  });

  it("keeps a non-web link", () => {
    const [section] = elements("[RFC](hive://shelf/x?tab=doc&v=1)");
    expect(section.elements).toEqual([
      { type: "link", url: "hive://shelf/x?tab=doc&v=1", text: "RFC" },
    ]);
  });

  it("separates paragraphs with a blank line inside one section", () => {
    const [section] = elements("one\n\ntwo");
    expect(section.elements).toEqual([
      { type: "text", text: "one" },
      { type: "text", text: "\n\n" },
      { type: "text", text: "two" },
    ]);
  });

  it("builds a bullet list", () => {
    const blocks = elements("- one\n- two");
    expect(blocks[0].type).toBe("rich_text_list");
    expect(blocks[0].style).toBe("bullet");
    expect(blocks[0].elements).toHaveLength(2);
  });

  it("builds an ordered list", () => {
    expect(elements("1. one\n2. two")[0].style).toBe("ordered");
  });

  it("indents a nested list", () => {
    const blocks = elements("- one\n  - nested");
    expect(blocks.map((block) => block.indent)).toEqual([0, 1]);
  });

  it("builds a quote", () => {
    expect(elements("> quoted")[0].type).toBe("rich_text_quote");
  });

  it("builds a code block", () => {
    const [block] = elements("```\nconst a = 1\n```");
    expect(block.type).toBe("rich_text_preformatted");
    expect(block.elements).toEqual([{ type: "text", text: "const a = 1" }]);
  });

  it("turns mentions, channels and emoji into their own elements", () => {
    const [section] = elements("cc <@U0748LXRG48> in <#C07US58UC1Z> :tada:");
    expect(section.elements).toEqual([
      { type: "text", text: "cc " },
      { type: "user", user_id: "U0748LXRG48" },
      { type: "text", text: " in " },
      { type: "channel", channel_id: "C07US58UC1Z" },
      { type: "text", text: " " },
      { type: "emoji", name: "tada" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(markdownToRichText("")).toEqual([]);
  });
});
