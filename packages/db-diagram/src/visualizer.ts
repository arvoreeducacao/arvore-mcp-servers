import { createServer, Server } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";

export function visualize(mermaidCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const html = buildHtml(mermaidCode);
    const server: Server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }

      const url = `http://127.0.0.1:${address.port}`;
      openBrowser(url);

      setTimeout(() => {
        server.close();
      }, 300_000);

      resolve(url);
    });

    server.on("error", reject);
  });
}

function openBrowser(url: string): void {
  const cmd =
    platform() === "darwin"
      ? `open "${url}"`
      : platform() === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, () => {});
}

function buildHtml(mermaidCode: string): string {
  const escaped = mermaidCode.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DB Diagram</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
  #viewport { width: 100%; height: 100%; cursor: grab; overflow: hidden; }
  #viewport.dragging { cursor: grabbing; }
  #diagram { display: inline-block; padding: 2rem; transform-origin: 0 0; }
</style>
</head>
<body>
<div id="viewport">
  <div id="diagram">
    <pre class="mermaid">${escaped}</pre>
  </div>
</div>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark', er: { useMaxWidth: false, layoutDirection: 'LR' } });

  const viewport = document.getElementById('viewport');
  const diagram = document.getElementById('diagram');
  let isPanning = false;
  let startX = 0, startY = 0;
  let offsetX = 0, offsetY = 0;
  let scale = 1;

  function applyTransform() {
    diagram.style.transform = \`translate(\${offsetX}px, \${offsetY}px) scale(\${scale})\`;
  }

  viewport.addEventListener('mousedown', (e) => {
    isPanning = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    viewport.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    viewport.classList.remove('dragging');
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 5);
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    offsetX -= (mx - offsetX) * (newScale / scale - 1);
    offsetY -= (my - offsetY) * (newScale / scale - 1);
    scale = newScale;
    applyTransform();
  }, { passive: false });
</script>
</body>
</html>`;
}
