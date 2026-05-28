export interface BuildMimeParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: "text" | "html";
  inReplyTo?: string;
  references?: string;
  from?: string;
}

export function buildMimeMessage(params: BuildMimeParams): string {
  const headers: string[] = [];

  if (params.from) headers.push(`From: ${params.from}`);
  headers.push(`To: ${params.to.join(", ")}`);
  if (params.cc?.length) headers.push(`Cc: ${params.cc.join(", ")}`);
  if (params.bcc?.length) headers.push(`Bcc: ${params.bcc.join(", ")}`);
  headers.push(`Subject: ${encodeHeader(params.subject)}`);
  headers.push("MIME-Version: 1.0");

  const contentType =
    params.bodyType === "html"
      ? "text/html; charset=UTF-8"
      : "text/plain; charset=UTF-8";
  headers.push(`Content-Type: ${contentType}`);
  headers.push("Content-Transfer-Encoding: base64");

  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);

  const encodedBody = Buffer.from(params.body, "utf-8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;
}

export function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const encoded = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

export function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export interface ExtractedHeaders {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export function extractHeaders(
  headers?: Array<{ name: string; value: string }>
): ExtractedHeaders {
  if (!headers) return {};
  const map: Record<string, string> = {};
  for (const h of headers) {
    map[h.name.toLowerCase()] = h.value;
  }
  return {
    from: map.from,
    to: map.to,
    cc: map.cc,
    bcc: map.bcc,
    subject: map.subject,
    date: map.date,
    messageId: map["message-id"],
    inReplyTo: map["in-reply-to"],
    references: map.references,
  };
}

export function extractBodyText(payload?: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  }>;
}): { text: string; html: string } {
  let text = "";
  let html = "";

  function walk(node: typeof payload): void {
    if (!node) return;

    if (node.body?.data) {
      const decoded = decodeBase64Url(node.body.data).toString("utf-8");
      if (node.mimeType === "text/plain" && !text) text = decoded;
      else if (node.mimeType === "text/html" && !html) html = decoded;
    }

    if (node.parts) {
      for (const part of node.parts) {
        walk(part as typeof payload);
      }
    }
  }

  walk(payload);
  return { text, html };
}
