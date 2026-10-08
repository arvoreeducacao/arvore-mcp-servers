import type { FigmaFrame } from "./types.js";

export async function fetchFigmaFrame(figmaUrl: string, apiKey: string): Promise<FigmaFrame> {
  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

  const nodeResponse = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`,
    { headers: { "X-Figma-Token": apiKey } }
  );

  if (!nodeResponse.ok) {
    throw new Error(`Figma API error: ${nodeResponse.status} ${await nodeResponse.text()}`);
  }

  const nodeData = await nodeResponse.json() as any;
  const node = nodeData.nodes[nodeId]?.document;

  if (!node) {
    throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
  }

  const width = Math.round(node.absoluteBoundingBox?.width || node.size?.x || 1440);
  const height = Math.round(node.absoluteBoundingBox?.height || node.size?.y || 900);

  const imageResponse = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=1`,
    { headers: { "X-Figma-Token": apiKey } }
  );

  if (!imageResponse.ok) {
    throw new Error(`Figma image API error: ${imageResponse.status}`);
  }

  const imageData = await imageResponse.json() as any;
  const imageUrl = imageData.images[nodeId];

  if (!imageUrl) {
    throw new Error("Could not generate Figma image URL");
  }

  return {
    nodeId,
    name: node.name || "Untitled",
    width,
    height,
    imageUrl,
  };
}

export async function downloadFigmaImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Figma image: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } {
  const figmaRegex = /figma\.com\/(design|file)\/([a-zA-Z0-9]+)/;
  const match = url.match(figmaRegex);

  if (!match) {
    throw new Error(`Invalid Figma URL: ${url}`);
  }

  const fileKey = match[2];

  let nodeId = "";
  const nodeMatch = url.match(/node-id=([^&]+)/);
  if (nodeMatch) {
    nodeId = decodeURIComponent(nodeMatch[1]).replaceAll("-", ":");
  }

  if (!nodeId) {
    throw new Error("Figma URL must include a node-id parameter");
  }

  return { fileKey, nodeId };
}
