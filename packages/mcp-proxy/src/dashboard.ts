import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { McpConnectorManager } from "./connector.js";
import type { ToolRegistry } from "./registry.js";
import type { AuditLogger } from "./logger.js";

function readVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export class Dashboard {
  private server: Server | null = null;
  private readonly version: string;

  constructor(
    private readonly connector: McpConnectorManager,
    private readonly registry: ToolRegistry,
    private readonly logger: AuditLogger,
    private port: number = 9100
  ) {
    this.version = readVersion();
  }

  start(): void {
    this.server = createServer((req, res) => {
      if (req.url === "/api/status") {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(this.getData()));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(this.getHtml());
    });
    this.server.on("error", (err: Error & { code?: string }) => {
      if (err.code === "EADDRINUSE") {
        this.port++;
        console.error(`[dashboard] Port taken, trying ${this.port}...`);
        this.server!.listen(this.port, "127.0.0.1");
      }
    });
    this.server.listen(this.port, "127.0.0.1", () => {
      console.error(`[dashboard] http://localhost:${this.port}`);
    });
  }

  stop(): void {
    this.server?.close();
  }

  private getData() {
    const statuses = this.connector.getStatuses();
    return {
      version: this.version,
      upstreams: statuses.map((s) => ({
        ...s,
        tools: this.registry.getByProvider(s.name).map((t) => ({
          ref: t.ref,
          name: t.originalName,
          title: t.title,
          description: t.description,
        })),
      })),
      recentLogs: this.logger.getEntries(30),
    };
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Proxy Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#e1e4e8;padding:24px}
.header{display:flex;align-items:baseline;gap:10px;margin-bottom:20px}
.header h1{font-size:1.4rem;color:#58a6ff}
.header .version{font-size:.8rem;color:#8b949e}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(400px,1fr))}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.card-header{display:flex;align-items:center;gap:8px;padding:12px 16px;cursor:pointer;user-select:none}
.card-header:hover{background:#1c2129}
.card-header h2{font-size:1rem;flex:1;display:flex;align-items:center;gap:8px}
.card-header .tools-count{color:#8b949e;font-size:.8rem;font-weight:400}
.card-header .chevron{color:#8b949e;font-size:.75rem;transition:transform .2s}
.card-header .chevron.open{transform:rotate(90deg)}
.card-body{padding:0 16px 16px;display:none}
.card-body.open{display:block}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600}
.connected,.idle{background:#238636;color:#fff}
.error{background:#da3633;color:#fff}
.connecting,.activating{background:#d29922;color:#000}
.tools{margin-top:8px}
.tool{background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:8px 10px;margin-top:6px;font-size:.85rem}
.tool .name{color:#79c0ff;font-weight:600}
.tool .desc{color:#8b949e;margin-top:2px;font-size:.8rem}
.logs{margin-top:12px;max-height:200px;overflow-y:auto;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:8px;font-family:monospace;font-size:.75rem;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#8b949e}
.error-msg{color:#f85149;margin-top:6px;font-size:.85rem;font-family:monospace;white-space:pre-wrap;word-break:break-all;background:#1c0c0c;border:1px solid #da3633;border-radius:4px;padding:8px;max-height:300px;overflow-y:auto}
.meta{color:#8b949e;font-size:.8rem;margin-top:4px}
h3{font-size:.85rem;color:#8b949e;margin-top:12px;margin-bottom:4px}
.audit{margin-top:20px}
.audit table{width:100%;border-collapse:collapse;font-size:.8rem}
.audit th,.audit td{text-align:left;padding:6px 8px;border-bottom:1px solid #21262d}
.audit th{color:#8b949e;font-weight:600}
.audit .err{color:#f85149}
.refresh{background:#21262d;color:#c9d1d9;border:1px solid #30363d;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.85rem;margin-bottom:16px}
.refresh:hover{background:#30363d}
</style>
</head>
<body>
<div class="header">
  <h1>MCP Proxy Dashboard</h1>
  <span class="version" id="version"></span>
</div>
<button class="refresh" onclick="load()">Refresh</button>
<div class="grid" id="grid"></div>
<div class="audit" id="audit"></div>
<script>
const expanded=new Set();
function toggle(name){
  if(expanded.has(name))expanded.delete(name);else expanded.add(name);
  render(window._data);
}
function render(d){
  if(!d)return;
  window._data=d;
  document.getElementById('version').textContent='v'+d.version;
  const grid=document.getElementById('grid');
  grid.innerHTML=d.upstreams.map(u=>{
    const isOpen=expanded.has(u.name);
    return \`<div class="card">
      <div class="card-header" onclick="toggle('\${esc(u.name)}')">
        <h2>\${esc(u.name)} <span class="badge \${u.status}">\${u.status}</span>
          <span class="tools-count">\${u.toolCount} tools</span></h2>
        <span class="chevron \${isOpen?'open':''}">&#9654;</span>
      </div>
      \${isOpen?\`<div class="card-body open">
        <div class="meta">Transport: \${u.transport}</div>
        \${u.error?\`<div class="error-msg">\${esc(u.error)}</div>\`:''}
        \${u.tools.length?\`<h3>Tools</h3><div class="tools">\${u.tools.map(t=>\`
          <div class="tool"><span class="name">\${esc(t.name)}</span><div class="desc">\${esc(t.description)}</div></div>
        \`).join('')}</div>\`:''}
        \${u.logs.length?\`<h3>Logs</h3><div class="logs">\${esc(u.logs.join('\\n'))}</div>\`:''}
      </div>\`:''}
    </div>\`;
  }).join('');
  const audit=document.getElementById('audit');
  if(d.recentLogs.length){
    audit.innerHTML=\`<h3>Recent Audit Log</h3><table>
      <tr><th>Time</th><th>Tool</th><th>Provider</th><th>Ms</th><th>Size</th><th>Error</th></tr>
      \${d.recentLogs.map(e=>\`<tr>
        <td>\${e.timestamp.slice(11,19)}</td><td>\${esc(e.tool)}</td><td>\${esc(e.provider)}</td>
        <td>\${e.executionTimeMs}</td><td>\${e.outputSize}</td>
        <td class="\${e.error?'err':''}">\${e.error?esc(e.error):'-'}</td>
      </tr>\`).join('')}
    </table>\`;
  }
}
async function load(){
  const r=await fetch('/api/status');
  const d=await r.json();
  render(d);
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
load();setInterval(load,5000);
</script>
</body>
</html>`;
  }
}
