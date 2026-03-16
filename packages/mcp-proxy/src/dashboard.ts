import { createServer, type Server } from "node:http";
import type { McpConnectorManager } from "./connector.js";
import type { ToolRegistry } from "./registry.js";
import type { AuditLogger } from "./logger.js";

export class Dashboard {
  private server: Server | null = null;

  constructor(
    private readonly connector: McpConnectorManager,
    private readonly registry: ToolRegistry,
    private readonly logger: AuditLogger,
    private readonly port: number = 9100
  ) {}

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
    this.server.listen(this.port, () => {
      console.error(`[dashboard] http://localhost:${this.port}`);
    });
  }

  stop(): void {
    this.server?.close();
  }

  private getData() {
    const statuses = this.connector.getStatuses();
    return {
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
h1{font-size:1.4rem;margin-bottom:20px;color:#58a6ff}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(400px,1fr))}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;overflow:hidden}
.card h2{font-size:1rem;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600}
.connected{background:#238636;color:#fff}
.error{background:#da3633;color:#fff}
.connecting{background:#d29922;color:#000}
.tools{margin-top:12px}
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
<h1>MCP Proxy Dashboard</h1>
<button class="refresh" onclick="load()">Refresh</button>
<div class="grid" id="grid"></div>
<div class="audit" id="audit"></div>
<script>
async function load(){
  const r=await fetch('/api/status');
  const d=await r.json();
  const grid=document.getElementById('grid');
  grid.innerHTML=d.upstreams.map(u=>\`
    <div class="card">
      <h2>\${esc(u.name)} <span class="badge \${u.status}">\${u.status}</span></h2>
      <div class="meta">Transport: \${u.transport} | Tools: \${u.toolCount}</div>
      \${u.error?\`<div class="error-msg">\${esc(u.error)}</div>\`:''}
      \${u.tools.length?\`<h3>Tools</h3><div class="tools">\${u.tools.map(t=>\`
        <div class="tool"><span class="name">\${esc(t.name)}</span><div class="desc">\${esc(t.description)}</div></div>
      \`).join('')}</div>\`:''}
      \${u.logs.length?\`<h3>Logs</h3><div class="logs">\${esc(u.logs.join('\\n'))}</div>\`:''}
    </div>
  \`).join('');
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
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
load();setInterval(load,5000);
</script>
</body>
</html>`;
  }
}
