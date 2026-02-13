import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { platform } from "node:os";
import { D1DatabaseClient } from "./d1-client.js";
import { TempMailMCPError } from "./types.js";

export interface WebUIOptions {
  port?: number;
  open?: boolean;
}

export class WebUIServer {
  private server: http.Server;
  private store: D1DatabaseClient;
  private port: number;
  private domain: string;
  private shouldOpen: boolean;

  constructor(options: WebUIOptions = {}) {
    this.loadEnvFile();
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !databaseId || !apiToken) {
      throw new Error(
        "Missing required environment variables: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN"
      );
    }
    this.port = options.port ?? 3847;
    this.shouldOpen = options.open ?? true;
    this.domain = process.env.TEMPMAIL_DOMAIN || "tempmail.arvore.com.br";
    this.store = new D1DatabaseClient({ accountId, databaseId, apiToken });
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error("Request error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
      });
    });
  }

  private loadEnvFile(): void {
    const envPath = resolve(process.cwd(), ".env");
    if (!existsSync(envPath)) return;
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex);
      const value = trimmed.substring(eqIndex + 1);
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error("Port " + this.port + " is already in use. Try: tempmail-mcp ui --port <number>");
          process.exit(1);
        }
        reject(err);
      });
      this.server.listen(this.port, () => {
        const url = "http://localhost:" + this.port;
        console.log("\n  TempMail UI running at " + url);
        console.log("  Domain: " + this.domain);
        console.log("  Press Ctrl+C to stop\n");
        if (this.shouldOpen) this.openBrowser(url);
        resolvePromise();
      });
    });
  }

  stop(): void {
    this.server.close();
  }

  private openBrowser(url: string): void {
    const os = platform();
    const cmd = os === "darwin" ? "open" : os === "win32" ? "start" : "xdg-open";
    exec(cmd + " " + url);
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || "/", "http://localhost:" + this.port);
    const method = req.method || "GET";
    const path = parsedUrl.pathname;

    if (method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(this.getHtml());
      return;
    }
    if (path.startsWith("/api/")) {
      await this.handleApi(method, path, req, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }

  private async handleApi(method: string, path: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");
    try {
      if (path === "/api/domain" && method === "GET") {
        return this.json(res, { domain: this.domain });
      }
      if (path === "/api/accounts") {
        if (method === "GET") {
          return this.json(res, await this.store.listAccounts(1, 100));
        }
        if (method === "POST") {
          const body = await this.parseBody(req);
          const username = String(body.username || "").trim();
          if (!username || !/^[a-zA-Z0-9._-]+$/.test(username)) {
            return this.json(res, { error: "Invalid username. Use only letters, numbers, dots, hyphens, and underscores." }, 400);
          }
          return this.json(res, await this.store.createAccount(username, this.domain), 201);
        }
      }
      const acctDel = path.match(/^\/api\/accounts\/([^/]+)$/);
      if (acctDel && method === "DELETE") {
        await this.store.deleteAccount(acctDel[1]);
        return this.json(res, { success: true });
      }
      const inbox = path.match(/^\/api\/accounts\/([^/]+)\/inbox$/);
      if (inbox && method === "GET") {
        return this.json(res, await this.store.getInbox(inbox[1], 1, 50));
      }
      const msg = path.match(/^\/api\/messages\/([^/]+)$/);
      if (msg) {
        if (method === "GET") {
          const message = await this.store.getMessageById(msg[1]);
          if (!message) return this.json(res, { error: "Not found" }, 404);
          return this.json(res, message);
        }
        if (method === "DELETE") {
          await this.store.deleteMessage(msg[1]);
          return this.json(res, { success: true });
        }
      }
      this.json(res, { error: "Not Found" }, 404);
    } catch (error) {
      const sc = error instanceof TempMailMCPError ? error.statusCode || 500 : 500;
      this.json(res, { error: error instanceof Error ? error.message : "Internal Server Error" }, sc);
    }
  }

  private parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString(); });
      req.on("end", () => {
        try { resolve(body ? JSON.parse(body) as Record<string, unknown> : {}); }
        catch { reject(new Error("Invalid JSON")); }
      });
      req.on("error", reject);
    });
  }

  private json(res: http.ServerResponse, data: unknown, sc = 200): void {
    res.writeHead(sc);
    res.end(JSON.stringify(data));
  }

  getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TempMail</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ea4335' stroke-width='2'><rect x='2' y='4' width='20' height='16' rx='2'/><path d='M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7'/></svg>">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{fontFamily:{sans:['Inter','system-ui','sans-serif']}}}</script>
<style>
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}}
.anim-toast{animation:toast-in .25s ease}
#modal.open{opacity:1;pointer-events:auto}
#modal.open>div{transform:none}
</style>
</head>
<body class="bg-slate-50 h-screen overflow-hidden">
<div class="grid grid-rows-[64px_1fr] grid-cols-[256px_1fr] max-md:grid-cols-[1fr] h-screen font-sans">

  <header class="col-span-full bg-white border-b border-gray-200 flex items-center px-4 gap-4 z-10">
    <div class="flex items-center gap-2.5 w-56 max-md:w-auto shrink-0 text-xl font-semibold tracking-tight">
      <svg class="w-9 h-9 shrink-0" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="#ea4335" stroke-width="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" stroke="#ea4335" stroke-width="2" stroke-linecap="round"/></svg>
      TempMail
    </div>
    <div class="bg-slate-50 rounded-3xl py-2.5 px-5 text-sm text-gray-500 flex-1 max-w-lg" id="hdr-domain">Loading...</div>
    <button class="bg-transparent border-none cursor-pointer w-10 h-10 rounded-full inline-flex items-center justify-center text-gray-500 hover:bg-black/5 shrink-0" onclick="refreshAll()" title="Refresh">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
    </button>
  </header>

  <aside class="bg-slate-50 p-2 overflow-y-auto max-md:hidden">
    <button class="flex items-center gap-3 px-6 h-14 rounded-2xl bg-blue-100 hover:shadow-lg font-semibold text-sm w-full mb-3 border-none cursor-pointer transition-shadow font-sans" onclick="showModal()">
      <svg class="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      New Account
    </button>
    <ul id="acct-list" class="list-none"></ul>
  </aside>

  <main class="bg-white rounded-tl-2xl overflow-y-auto flex flex-col" id="main"></main>
</div>

<div id="modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] opacity-0 pointer-events-none transition-opacity duration-150">
  <div class="bg-white rounded-2xl p-7 w-[420px] max-w-[90vw] shadow-2xl translate-y-2 transition-transform duration-150">
    <h2 class="text-lg font-semibold mb-5">Create Email Account</h2>
    <div class="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden mb-5 focus-within:border-blue-500 transition-colors">
      <input type="text" id="inp-user" placeholder="username" autocomplete="off" class="flex-1 border-none outline-none px-3.5 py-3 text-base font-sans">
      <span id="inp-suffix" class="px-3.5 py-3 bg-slate-50 text-gray-500 text-sm border-l border-gray-200 whitespace-nowrap">@...</span>
    </div>
    <div id="modal-err" class="text-red-600 text-sm -mt-3 mb-3 hidden"></div>
    <div class="flex justify-end gap-2">
      <button class="px-6 py-2.5 rounded-lg text-sm font-semibold cursor-pointer font-sans bg-transparent text-blue-600 hover:bg-blue-50 border-none" onclick="hideModal()">Cancel</button>
      <button id="btn-create" class="px-6 py-2.5 rounded-lg text-sm font-semibold cursor-pointer font-sans bg-blue-600 text-white hover:bg-blue-700 border-none disabled:opacity-50 disabled:cursor-not-allowed" onclick="doCreate()">Create</button>
    </div>
  </div>
</div>

<div id="toasts" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center"></div>

<script>
var DOMAIN="${this.domain}";
var S={accounts:[],selId:null,inbox:{messages:[],total:0},email:null,view:"welcome",busy:false};
var _t=null;
var _ib="bg-transparent border-none cursor-pointer w-10 h-10 rounded-full inline-flex items-center justify-center text-gray-500 hover:bg-black/5 shrink-0";
var _emailCss='*{box-sizing:border-box}body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1f1f1f;word-break:break-word;-webkit-font-smoothing:antialiased}img{max-width:100%;height:auto}a{color:#1a73e8}pre,code{white-space:pre-wrap;overflow-x:auto;font-size:13px}table{border-collapse:collapse;max-width:100%}td,th{vertical-align:top}blockquote{margin:8px 0;padding:0 12px;border-left:3px solid #dadce0;color:#5f6368}';
function _wrap(h){return '<base target="_blank"><style>'+_emailCss+'</style>'+h}
function resizeIf(f){try{var b=f.contentDocument&&f.contentDocument.body;if(b){var h=Math.max(b.scrollHeight,b.offsetHeight);if(h>50)f.style.height=h+32+"px"}}catch(e){}};

function api(p,o){o=o||{};o.headers={"Content-Type":"application/json"};return fetch("/api"+p,o).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"HTTP "+r.status);return d})})}
function esc(s){if(!s)return"";var d=document.createElement("div");d.textContent=String(s);return d.innerHTML}
function escA(s){return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

function fmtD(v){
  if(!v)return"";var d=new Date(v.indexOf("Z")>-1?v:v+"Z"),n=new Date(),m=Math.floor((n-d)/60000);
  if(m<1)return"now";if(m<60)return m+"m";if(m<1440)return Math.floor(m/60)+"h";
  if(d.getFullYear()===n.getFullYear())return d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
  return d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
}
function fmtF(v){if(!v)return"";var d=new Date(v.indexOf("Z")>-1?v:v+"Z");return d.toLocaleString(undefined,{weekday:"short",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}

function toast(m,e){var c=document.getElementById("toasts"),t=document.createElement("div");t.className="px-6 py-3 rounded-lg text-sm shadow-lg anim-toast "+(e?"bg-red-600":"bg-gray-800")+" text-white";t.textContent=m;c.appendChild(t);setTimeout(function(){t.remove()},3000)}

function loadAccounts(){return api("/accounts").then(function(d){S.accounts=d.accounts;renderSidebar()})}

function selectAcct(id){S.selId=id;S.email=null;S.view="inbox";renderSidebar();loadInbox();if(_t)clearInterval(_t);_t=setInterval(function(){if(S.selId&&S.view==="inbox")loadInbox()},10000)}

function loadInbox(){
  if(!S.selId)return Promise.resolve();S.busy=true;renderMain();
  return api("/accounts/"+S.selId+"/inbox").then(function(d){S.inbox=d;S.busy=false;renderMain()}).catch(function(e){toast(e.message,true);S.inbox={messages:[],total:0};S.busy=false;renderMain()})
}

function openEmail(id){
  S.busy=true;S.view="email";renderMain();
  api("/messages/"+id).then(function(d){S.email=d;var m=S.inbox.messages.find(function(x){return x.id===id});if(m)m.seen=true;S.busy=false;renderMain();setTimeout(function(){var f=document.querySelector("iframe");if(f)resizeIf(f)},300);setTimeout(function(){var f=document.querySelector("iframe");if(f)resizeIf(f)},1500)}).catch(function(e){toast(e.message,true);S.view="inbox";S.busy=false;renderMain()})
}

function goBack(){S.email=null;S.view="inbox";renderMain()}

function delAcct(id,ev){
  ev.stopPropagation();var a=S.accounts.find(function(x){return x.id===id});
  if(!confirm("Delete "+(a?a.address:"account")+"?\\nAll emails will be lost."))return;
  api("/accounts/"+id,{method:"DELETE"}).then(function(){if(S.selId===id){S.selId=null;S.view="welcome";S.inbox={messages:[],total:0};renderMain()}loadAccounts();toast("Account deleted")}).catch(function(e){toast(e.message,true)})
}

function delEmail(id){
  if(!confirm("Delete this email?"))return;
  api("/messages/"+id,{method:"DELETE"}).then(function(){S.email=null;S.view="inbox";loadInbox();toast("Email deleted")}).catch(function(e){toast(e.message,true)})
}

function refreshAll(){loadAccounts().then(function(){if(S.selId)return loadInbox()});toast("Refreshed")}

function copyAddr(){var a=S.accounts.find(function(x){return x.id===S.selId});if(!a)return;navigator.clipboard.writeText(a.address).then(function(){toast("Copied: "+a.address)})}

function showModal(){document.getElementById("modal").classList.add("open");var i=document.getElementById("inp-user");i.value="";i.focus();document.getElementById("inp-suffix").textContent="@"+DOMAIN;document.getElementById("modal-err").classList.add("hidden")}
function hideModal(){document.getElementById("modal").classList.remove("open")}

function doCreate(){
  var u=document.getElementById("inp-user").value.trim();if(!u){document.getElementById("inp-user").focus();return}
  if(!/^[a-zA-Z0-9._-]+$/.test(u)){var er=document.getElementById("modal-err");er.textContent="Only letters, numbers, dots, hyphens, underscores";er.classList.remove("hidden");return}
  var b=document.getElementById("btn-create");b.disabled=true;b.textContent="Creating...";
  api("/accounts",{method:"POST",body:JSON.stringify({username:u})}).then(function(){hideModal();loadAccounts();toast(u+"@"+DOMAIN+" created")}).catch(function(e){var er=document.getElementById("modal-err");er.textContent=e.message;er.classList.remove("hidden")}).finally(function(){b.disabled=false;b.textContent="Create"})
}

function renderSidebar(){
  var el=document.getElementById("acct-list");
  if(!S.accounts.length){el.innerHTML='<li class="p-3 text-gray-500 text-sm">No accounts yet.</li>';return}
  el.innerHTML=S.accounts.map(function(a){
    var ac=a.id===S.selId?" bg-blue-100 !text-blue-700 !font-bold":"";
    return '<li class="flex items-center gap-3 px-3 h-9 rounded-full cursor-pointer text-sm font-medium text-gray-600 hover:bg-black/[.04] mb-0.5 group'+ac+'" onclick="selectAcct(\\''+a.id+'\\')">'+
      '<svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>'+
      '<span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title="'+esc(a.address)+'">'+esc(a.address)+'</span>'+
      '<button class="opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer text-gray-500 hover:text-red-600 p-0.5 rounded-full flex transition-opacity" onclick="delAcct(\\''+a.id+'\\',event)">'+
      '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'+
      '</button></li>'
  }).join("")
}

function renderMain(){
  var el=document.getElementById("main");
  if(S.busy&&S.view!=="email"){el.innerHTML='<div class="flex items-center justify-center flex-1 p-10"><div class="w-7 h-7 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin"></div></div>';return}
  if(S.view==="welcome"){el.innerHTML=rWelcome();return}
  if(S.view==="inbox"){el.innerHTML=rInbox();return}
  if(S.view==="email"){el.innerHTML=S.busy?'<div class="flex items-center justify-center flex-1 p-10"><div class="w-7 h-7 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin"></div></div>':rEmail();return}
}

function rWelcome(){
  return '<div class="flex flex-col items-center justify-center flex-1 text-gray-500 gap-3 p-10 text-center">'+
    '<svg class="w-24 h-24 opacity-25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>'+
    '<h2 class="text-lg font-semibold text-gray-900">Welcome to TempMail</h2>'+
    '<p class="text-sm max-w-sm leading-relaxed">Select an account or create a new one to start receiving emails.</p></div>'
}

function rInbox(){
  var a=S.accounts.find(function(x){return x.id===S.selId}),addr=a?a.address:"";
  var tb='<div class="flex items-center px-2 py-1.5 border-b border-gray-200 gap-1 shrink-0 min-h-[48px]">'+
    '<span class="flex-1 text-sm text-gray-500 px-2 truncate">'+esc(addr)+' &mdash; '+S.inbox.total+' message'+(S.inbox.total!==1?'s':'')+'</span>'+
    '<button class="'+_ib+'" onclick="copyAddr()" title="Copy address"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'+
    '<button class="'+_ib+'" onclick="loadInbox()" title="Refresh"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></button></div>';
  if(!S.inbox.messages.length){
    return tb+'<div class="flex flex-col items-center justify-center flex-1 text-gray-500 gap-3 p-10 text-center">'+
      '<svg class="w-24 h-24 opacity-25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>'+
      '<h2 class="text-lg font-semibold text-gray-900">No emails yet</h2>'+
      '<p class="text-sm max-w-sm leading-relaxed">Send an email to <strong>'+esc(addr)+'</strong> and it will appear here.</p>'+
      '<button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-100 text-blue-700 text-sm font-semibold cursor-pointer border-none hover:bg-blue-200 mt-1 font-sans" onclick="copyAddr()">Copy address</button></div>'
  }
  return tb+S.inbox.messages.map(function(m){
    var u=m.seen?"text-gray-600":"bg-white font-bold text-gray-900";
    var dc=m.seen?"text-gray-500":"text-gray-900 font-semibold";
    return '<div class="grid grid-cols-[180px_1fr_auto] items-center px-4 h-10 border-b border-gray-100 cursor-pointer text-sm hover:bg-gray-100 '+u+'" onclick="openEmail(\\''+m.id+'\\')">'+
      '<span class="truncate pr-2">'+esc(m.from_name||m.from_address||"Unknown")+'</span>'+
      '<div class="flex gap-1 overflow-hidden min-w-0"><span class="truncate shrink-0 max-w-[50%]">'+esc(m.subject||"(no subject)")+'</span><span class="text-gray-500 truncate font-normal">&mdash; '+esc((m.text||"").substring(0,120))+'</span></div>'+
      '<span class="text-xs whitespace-nowrap pl-3 '+dc+'">'+fmtD(m.created_at)+'</span></div>'
  }).join("")
}

function rEmail(){
  var e=S.email;if(!e)return rInbox();
  var init=(e.from_name||e.from_address||"?")[0].toUpperCase();
  var cols=["#1a73e8","#ea4335","#34a853","#fbbc04","#9334e6","#e8710a"];
  var ci=(e.from_address||"").length%cols.length;
  var body=e.html
    ?'<iframe srcdoc="'+escA(_wrap(e.html))+'" sandbox="allow-same-origin allow-popups" class="w-full border-none" style="min-height:400px" onload="resizeIf(this)"></iframe>'
    :'<div class="whitespace-pre-wrap text-sm leading-relaxed">'+esc(e.text||"No content")+'</div>';
  return '<div class="flex flex-col flex-1">'+
    '<div class="flex items-center px-2 py-1.5 border-b border-gray-200 gap-1 shrink-0 min-h-[48px]">'+
    '<button class="'+_ib+'" onclick="goBack()" title="Back"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>'+
    '<span class="flex-1"></span>'+
    '<button class="'+_ib+' hover:!bg-red-50 hover:!text-red-600" onclick="delEmail(\\''+e.id+'\\')"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>'+
    '</div>'+
    '<div class="px-7 pt-6 pb-5">'+
    '<div class="text-2xl font-light mb-5 leading-snug">'+esc(e.subject||"(no subject)")+'</div>'+
    '<div class="flex items-center gap-3.5">'+
    '<div class="w-10 h-10 rounded-full text-white flex items-center justify-center text-lg font-semibold shrink-0" style="background:'+cols[ci]+'">'+esc(init)+'</div>'+
    '<div class="flex-1 min-w-0"><div class="font-semibold text-sm">'+esc(e.from_name||e.from_address)+'</div><div class="text-xs text-gray-500">&lt;'+esc(e.from_address)+'&gt; to '+esc(e.to_address)+'</div></div>'+
    '<div class="text-xs text-gray-500 whitespace-nowrap">'+fmtF(e.created_at)+'</div>'+
    '</div></div>'+
    '<div class="flex-1 px-7 pb-7 overflow-y-auto">'+body+'</div></div>'
}

document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){if(document.getElementById("modal").classList.contains("open")){hideModal();return}if(S.view==="email"){goBack();return}}
  if(e.key==="Enter"&&document.getElementById("modal").classList.contains("open"))doCreate()
});
document.getElementById("modal").addEventListener("click",function(e){if(e.target===this)hideModal()});

(function(){document.getElementById("hdr-domain").textContent=DOMAIN;document.getElementById("inp-suffix").textContent="@"+DOMAIN;loadAccounts().then(function(){renderMain()})})();
</script>
</body>
</html>`;
  }
}
