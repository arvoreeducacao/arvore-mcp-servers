type InlineStyles = Partial<{
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
}>;

interface TextInline {
  type: "text";
  text: string;
  styles?: InlineStyles;
}

interface LinkInline {
  type: "link";
  href: string;
  content?: Array<TextInline>;
}

type Inline = TextInline | LinkInline | { type: string; [key: string]: unknown };

interface TableCell {
  cells?: Array<Array<Inline>>;
}

export interface LeafBlock {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: Array<Inline> | { type: "tableContent"; rows?: Array<TableCell> };
  children?: Array<LeafBlock>;
}

function styledText(inline: TextInline): string {
  let text = inline.text ?? "";

  if (text.length === 0) {
    return text;
  }

  const styles = inline.styles ?? {};

  if (styles.code) {
    text = `\`${text}\``;
  }
  if (styles.bold) {
    text = `**${text}**`;
  }
  if (styles.italic) {
    text = `*${text}*`;
  }
  if (styles.strike) {
    text = `~~${text}~~`;
  }

  return text;
}

export function inlineToMarkdown(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((inline: Inline) => {
      if (inline.type === "text") {
        return styledText(inline as TextInline);
      }

      if (inline.type === "link") {
        const link = inline as LinkInline;
        const label = inlineToMarkdown(link.content) || link.href;

        return `[${label}](${link.href})`;
      }

      return "";
    })
    .join("");
}

function tableToMarkdown(
  content: { rows?: Array<TableCell> },
  indent: string
): string {
  const rows = content.rows ?? [];

  if (rows.length === 0) {
    return "";
  }

  const lines = rows.map(
    (row) =>
      `${indent}| ${(row.cells ?? [])
        .map((cell) => inlineToMarkdown(cell).replace(/\|/g, "\\|"))
        .join(" | ")} |`
  );
  const columnCount = rows[0]?.cells?.length ?? 0;
  const divider = `${indent}| ${Array.from({ length: columnCount })
    .map(() => "---")
    .join(" | ")} |`;

  return [lines[0], divider, ...lines.slice(1)].join("\n");
}

function blockToMarkdown(
  block: LeafBlock,
  indent: string,
  orderedIndex: number
): string {
  const text = Array.isArray(block.content)
    ? inlineToMarkdown(block.content)
    : "";
  const props = block.props ?? {};

  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(props.level) || 1, 1), 6);

      return `${indent}${"#".repeat(level)} ${text}`;
    }
    case "bulletListItem":
      return `${indent}- ${text}`;
    case "numberedListItem":
      return `${indent}${orderedIndex}. ${text}`;
    case "checkListItem":
      return `${indent}- [${props.checked ? "x" : " "}] ${text}`;
    case "quote":
      return `${indent}> ${text}`;
    case "codeBlock": {
      const language = typeof props.language === "string" ? props.language : "";

      return `${indent}\`\`\`${language}\n${text}\n${indent}\`\`\``;
    }
    case "callout":
      return `${indent}> ${text}`;
    case "divider":
      return `${indent}---`;
    case "table":
      return tableToMarkdown(
        (block.content ?? {}) as { rows?: Array<TableCell> },
        indent
      );
    case "image": {
      const url = typeof props.url === "string" ? props.url : "";
      const caption =
        typeof props.caption === "string" && props.caption.length > 0
          ? props.caption
          : "image";

      return `${indent}![${caption}](${url})`;
    }
    case "database": {
      const databaseId =
        typeof props.databaseId === "string" ? props.databaseId : "";

      return `${indent}[embedded database](/doc/${databaseId})`;
    }
    default:
      return `${indent}${text}`;
  }
}

export function blocksToMarkdown(
  blocks: ReadonlyArray<LeafBlock>,
  indent = ""
): string {
  const lines: Array<string> = [];
  let orderedIndex = 0;

  for (const block of blocks) {
    orderedIndex = block.type === "numberedListItem" ? orderedIndex + 1 : 0;

    const line = blockToMarkdown(block, indent, orderedIndex);

    if (line.trim().length > 0) {
      lines.push(line);
    }

    if (block.children && block.children.length > 0) {
      const child = blocksToMarkdown(block.children, `${indent}  `);

      if (child.length > 0) {
        lines.push(child);
      }
    }
  }

  return lines.join("\n");
}

export function contentToMarkdown(serialized: string | null): string {
  if (!serialized) {
    return "";
  }

  try {
    const parsed = JSON.parse(serialized);

    if (!Array.isArray(parsed)) {
      return "";
    }

    return blocksToMarkdown(parsed as Array<LeafBlock>);
  } catch {
    return "";
  }
}
