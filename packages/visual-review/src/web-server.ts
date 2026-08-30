import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchFigmaFrame, downloadFigmaImage } from "./figma-client.js";
import { compareImages } from "./diff.js";
import type { ReviewSession } from "./types.js";
import type { Server } from "node:http";

let activeServer: Server | null = null;

export function stopWebServer() {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
}

export function startWebServer(session: ReviewSession): string {
  stopWebServer();

  const app = express();
  const outputDir = join("/tmp", "visual-review", session.id);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  app.use("/vr/api", express.json({ limit: "50mb" }));
  app.use("/vr", (_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });

  const uiDir = join(import.meta.dirname, "..", "ui");

  let proxyToken = "";

  app.get("/vr", (_req, res) => {
    res.sendFile(join(uiDir, "index.html"));
  });

  app.get("/vr/app.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.send(readFileSync(join(uiDir, "app.js")));
  });

  app.post("/vr/api/set-token", (req, res) => {
    proxyToken = req.body.token || "";
    res.json({ ok: true });
  });

  app.get("/vr/auth-redirect", (req, res) => {
    const target = req.query.to as string || "/";
    const token = req.query.token as string || proxyToken;
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-store");
    res.send(`<!DOCTYPE html><html><head><script>
      document.cookie="access_token=;path=/;max-age=0";
      document.cookie="access_token=;path=/app-v2;max-age=0";
      document.cookie="access_token=${token};path=/;max-age=86400";
      setTimeout(function(){ window.location.replace("${target}"); }, 100);
    </script></head><body></body></html>`);
  });

  app.get("/vr/api/session", (_req, res) => {
    res.json({
      routes: session.routes,
      baseUrl: session.baseUrl,
      hasFigmaKey: !!session.figmaApiKey,
    });
  });

  app.post("/vr/api/figma", async (req, res) => {
    try {
      const { figmaUrl } = req.body;
      if (!session.figmaApiKey) {
        res.status(400).json({ error: "FIGMA_API_KEY not configured" });
        return;
      }

      const frame = await fetchFigmaFrame(figmaUrl, session.figmaApiKey);
      const imageBuffer = await downloadFigmaImage(frame.imageUrl);

      const figmaPath = join(outputDir, `figma-${frame.nodeId.replace(":", "-")}.png`);
      writeFileSync(figmaPath, imageBuffer);

      const base64 = imageBuffer.toString("base64");
      res.json({
        image: `data:image/png;base64,${base64}`,
        width: frame.width,
        height: frame.height,
        name: frame.name,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/vr/api/compare", async (req, res) => {
    try {
      const { pageImage, figmaImage } = req.body;

      const pageBuffer = Buffer.from(pageImage.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const figmaBuffer = Buffer.from(figmaImage.replace(/^data:image\/\w+;base64,/, ""), "base64");

      const result = await compareImages(pageBuffer, figmaBuffer);

      const diffBase64 = result.diffImageBuffer.toString("base64");
      res.json({
        diffImage: `data:image/png;base64,${diffBase64}`,
        diffPercentage: result.diffPercentage.toFixed(2),
        differentPixels: result.differentPixels,
        totalPixels: result.totalPixels,
        matchPercentage: (100 - result.diffPercentage).toFixed(2),
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/vr/api/generate-prompt", (req, res) => {
    const { route, figmaUrl, figmaWidth, figmaHeight } = req.body;

    const prompt = [
      `Fix the visual differences on route "${route}".`,
      ``,
      `Context:`,
      `- Figma design: ${figmaUrl}`,
      `- Figma frame dimensions: ${figmaWidth}x${figmaHeight}px`,
      ``,
      `Instructions:`,
      `1. Fetch the Figma frame and compare with the current implementation`,
      `2. Identify spacing, color, typography, and layout differences`,
      `3. Fix the CSS/Tailwind classes to match the Figma design exactly`,
      `4. Ensure the page renders at the same dimensions as the Figma frame (${figmaWidth}x${figmaHeight}px)`,
      `5. Use Bonsai design tokens wherever possible`,
    ].join("\n");

    res.json({ prompt });
  });

  app.use("/", createProxyMiddleware({
    target: session.baseUrl,
    changeOrigin: true,
    ws: true,
    on: {
      proxyReq: (proxyReq, req) => {
        if (proxyToken) {
          const existing = (req.headers.cookie as string) || "";
          if (existing.includes("access_token")) {
            proxyReq.setHeader("cookie", existing);
          } else {
            proxyReq.setHeader("cookie", `${existing}; access_token=${proxyToken}`);
          }
        }
      },
    },
  }));

  activeServer = app.listen(session.port, () => {});

  return `http://localhost:${session.port}/vr`;
}
