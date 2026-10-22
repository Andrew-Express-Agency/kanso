/**
 * Kanso Studio Engine 2.0
 * 簡素 — Sovereign Tri-Device Visual Canvas, Defect Inspector & Model Gateway HUD.
 * Runs on localhost:3100. 100% Localhost · Zero Cloud Telemetry · Apple Design Materials.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { runVibeTest, VibeReport, VibeIssue } from "./vibe.js";
import { createHandoff, handoffStatus, resumeHandoff } from "./handoff.js";
import { loadMemories, remember } from "./memory.js";
import { detectHardware } from "../utils/hardware.js";
import { log } from "../utils/logger.js";
import { detectGatewayProviders, queryGateway, generateVisualRepairPlan, GatewayProvider } from "./gateway.js";
import { runSelfHealing, runSelfHealingWithAI, FixAction } from "./fix.js";

export interface StudioOptions {
  port?: number;
  open?: boolean;
  app?: boolean;
}

export function startStudioServer(targetUrl: string = "http://localhost:5173", opts: StudioOptions = {}) {
  const port = opts.port || 3100;

  let latestReport: VibeReport | null = null;
  const reportJsonPath = path.join(process.cwd(), ".kanso/vibe-reports/report.json");
  const reportMdPath = path.join(process.cwd(), ".kanso/vibe-reports/vibe-report.md");

  // Load existing report if available on disk
  if (fs.existsSync(reportJsonPath)) {
    try {
      latestReport = JSON.parse(fs.readFileSync(reportJsonPath, "utf-8"));
    } catch {
      latestReport = null;
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // Helper for JSON responses
    const sendJson = (data: any, status: number = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end(JSON.stringify(data));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // 1. GET /api/status
    if (url.pathname === "/api/status" && req.method === "GET") {
      const hw = detectHardware();
      const memories = loadMemories();
      const status = handoffStatus();
      const gateway = await detectGatewayProviders();
      sendJson({
        project: path.basename(process.cwd()),
        targetUrl,
        hardware: hw,
        memoryCount: memories.length,
        handoff: status,
        latestReport,
        gateway,
      });
      return;
    }

    // 2. POST /api/audit
    if (url.pathname === "/api/audit" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const auditUrl = parsed.url || targetUrl;
          latestReport = await runVibeTest(auditUrl);
          sendJson(latestReport);
        } catch (err: any) {
          sendJson({ error: err.message || String(err) }, 500);
        }
      });
      return;
    }

    // 3. GET /api/report
    if (url.pathname === "/api/report" && req.method === "GET") {
      sendJson(latestReport || { overallScore: 100, issues: [] });
      return;
    }

    // 4. POST /api/handoff
    if (url.pathname === "/api/handoff" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const payload = createHandoff({ task: parsed.task || "Studio visual inspection session" });
          sendJson(payload);
        } catch (err: any) {
          sendJson({ error: err.message || String(err) }, 500);
        }
      });
      return;
    }

    // 5. GET /api/memories
    if (url.pathname === "/api/memories" && req.method === "GET") {
      const memories = loadMemories();
      sendJson(memories);
      return;
    }

    // 6. GET /api/gateway/status
    if (url.pathname === "/api/gateway/status" && req.method === "GET") {
      const providers = await detectGatewayProviders();
      sendJson(providers);
      return;
    }

    // 7. POST /api/gateway/chat
    if (url.pathname === "/api/gateway/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (!parsed.prompt) {
            sendJson({ error: "Missing 'prompt' in request body." }, 400);
            return;
          }
          const response = await queryGateway(parsed.prompt, {
            provider: parsed.provider,
            model: parsed.model,
            systemPrompt: parsed.systemPrompt,
          });
          sendJson(response);
        } catch (err: any) {
          sendJson({ error: err.message || String(err) }, 500);
        }
      });
      return;
    }

    // 8. POST /api/fix
    if (url.pathname === "/api/fix" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (parsed.ai) {
            const result = await runSelfHealingWithAI({ provider: parsed.provider, model: parsed.model });
            sendJson(result);
          } else {
            const actions = runSelfHealing();
            sendJson({ actions });
          }
        } catch (err: any) {
          sendJson({ error: err.message || String(err) }, 500);
        }
      });
      return;
    }

    // 9. Reverse Proxy to bypass X-Frame-Options on remote sites
    if (url.pathname === "/proxy") {
      const target = url.searchParams.get("url");
      if (!target) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing target url parameter");
        return;
      }
      try {
        const fetched = await fetch(target, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 KansoStudio/2.0",
          },
        });
        const contentType = fetched.headers.get("content-type") || "text/html";
        if (contentType.includes("text/html")) {
          let text = await fetched.text();
          const baseTag = `<base href="${target}">`;
          if (!text.includes("<base ")) {
            text = text.replace(/<head>/i, `<head>\n  ${baseTag}`);
          }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(text);
        } else {
          const buffer = Buffer.from(await fetched.arrayBuffer());
          res.writeHead(200, {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
          });
          res.end(buffer);
        }
      } catch (err: any) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Proxy error: ${err.message}`);
      }
      return;
    }

    // 10. Serve Studio GUI (HTML)
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(generateStudioHtml(targetUrl, port, opts.app || false));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  });

  server.listen(port, () => {
    log.header("Kanso Studio 2.0", `Sovereign Developer HUD & Visual Canvas running on http://localhost:${port}`);
    log.item("Target App", targetUrl);
    log.item("Visual Canvas", "iPhone 15 Pro (393px) · iPad (768px) · MacBook (1440px)");
    log.item("Model Gateway", "Ollama (Offline) · Claude · OpenAI · Gemini · Heuristic Engine");
    log.item("App Window Mode", opts.app ? "Active (Native Frameless Window)" : "Standard Browser");

    if (opts.open !== false) {
      if (opts.app) {
        launchStandaloneAppMode(port);
      } else {
        const openCmd = process.platform === "darwin" ? `open http://localhost:${port}` : `xdg-open http://localhost:${port}`;
        exec(openCmd, () => {});
      }
    }
  });

  return server;
}

/**
 * Launch standalone Chrome app window for a native macOS desktop experience.
 */
function launchStandaloneAppMode(port: number) {
  const url = `http://localhost:${port}`;
  if (process.platform === "darwin") {
    const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(chromePath)) {
      const cmd = `open -na "Google Chrome" --args --app="${url}" --window-size=1480,940`;
      exec(cmd, (err) => {
        if (err) {
          exec(`open "${url}"`, () => {});
        }
      });
      return;
    }
    exec(`open "${url}"`, () => {});
  } else if (process.platform === "win32") {
    exec(`start chrome --app="${url}" --window-size=1480,940`, () => {});
  } else {
    exec(`google-chrome --app="${url}" --window-size=1480,940 || xdg-open "${url}"`, () => {});
  }
}

/**
 * Generate Apple-grade Studio HTML with Tri-Device Canvas, DOM Defect Inspector, and Model Gateway Copilot.
 */
function generateStudioHtml(defaultTarget: string, port: number, isAppMode: boolean): string {
  const initialFrameSrc = defaultTarget.startsWith("http://localhost") || defaultTarget.startsWith("http://127.0.0.1")
    ? defaultTarget
    : `/proxy?url=${encodeURIComponent(defaultTarget)}`;

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanso Studio (簡素) — Sovereign Visual Canvas & Model Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            canvas: '#070709',
            surface: '#0f0f13',
            surfaceCard: '#15151c',
            surfaceHighlight: '#1d1d26',
            borderSubtle: 'rgba(255, 255, 255, 0.08)',
            borderActive: 'rgba(255, 255, 255, 0.18)',
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #070709; color: #f3f4f6; overflow: hidden; height: 100vh; }
    .glass-nav {
      background: rgba(14, 14, 18, 0.88);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }
    .glass-panel {
      background: rgba(17, 17, 23, 0.92);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.09);
    }
    .device-viewport {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .scrollbar-hidden::-webkit-scrollbar { display: none; }
    .scrollbar-subtle::-webkit-scrollbar { width: 5px; height: 5px; }
    .scrollbar-subtle::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
    .scrollbar-subtle::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 9999px; }
    .mac-traffic-dot {
      width: 11px;
      height: 11px;
      border-radius: 9999px;
      display: inline-block;
    }
  </style>
</head>
<body class="flex flex-col h-screen select-none font-sans bg-canvas text-neutral-200">

  <!-- Top Studio HUD Bar (macOS Window Chrome + Controls) -->
  <header class="glass-nav h-14 px-4 flex items-center justify-between shrink-0 z-30">
    <div class="flex items-center gap-3.5">
      <!-- Traffic Lights (macOS Native Aesthetics) -->
      <div class="flex items-center gap-1.5 mr-1">
        <span class="mac-traffic-dot bg-[#ff5f56] border border-[#e0443e]"></span>
        <span class="mac-traffic-dot bg-[#ffbd2e] border border-[#dea123]"></span>
        <span class="mac-traffic-dot bg-[#27c93f] border border-[#1aab29]"></span>
      </div>

      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-md bg-white/10 border border-white/20 flex items-center justify-center font-bold text-xs text-white">
          簡
        </div>
        <span class="font-bold text-sm tracking-tight text-white">Kanso Studio</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-neutral-400">Phase 2</span>
      </div>

      <div class="h-4 w-px bg-white/10"></div>

      <!-- Target URL Bar with Live Status Indicator -->
      <div class="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-3 py-1 shadow-inner">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <input id="target-input" type="text" value="${defaultTarget}" class="bg-transparent text-xs font-mono text-white focus:outline-none w-64 placeholder-neutral-500" placeholder="http://localhost:5173" onkeydown="if(event.key==='Enter') updateCanvasUrl()">
        <button onclick="updateCanvasUrl()" title="Refresh Viewports" class="text-neutral-400 hover:text-white transition-colors">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
        </button>
      </div>

      <!-- Zoom / Canvas Scaling -->
      <div class="flex items-center bg-black/30 border border-white/10 rounded-lg p-0.5 text-[11px]">
        <button onclick="setZoom(0.65)" class="px-2 py-0.5 rounded text-neutral-400 hover:text-white">65%</button>
        <button onclick="setZoom(0.8)" class="px-2 py-0.5 rounded text-neutral-400 hover:text-white">80%</button>
        <button onclick="setZoom(1.0)" class="px-2 py-0.5 rounded bg-white/10 text-white font-medium">100%</button>
      </div>
    </div>

    <!-- Center: Live VibeScore Indicator & Viewport Switcher -->
    <div class="flex items-center gap-3">
      <!-- VibeScore Pill with Tooltip Info -->
      <div id="vibescore-pill" class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 cursor-pointer hover:bg-emerald-500/15 transition-all" onclick="toggleDefectsDrawer()">
        <i data-lucide="shield-check" class="w-4 h-4"></i>
        <span>VibeScore™: <span id="vibescore-val">100</span>/100</span>
      </div>

      <!-- Viewport Toggle Buttons -->
      <div class="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-xs">
        <button onclick="setViewMode('all')" id="btn-mode-all" class="px-2.5 py-1 rounded-md bg-white text-black font-semibold">Tri-Device</button>
        <button onclick="setViewMode('mobile')" id="btn-mode-mobile" class="px-2.5 py-1 rounded-md text-neutral-400 hover:text-white">iPhone (393px)</button>
        <button onclick="setViewMode('tablet')" id="btn-mode-tablet" class="px-2.5 py-1 rounded-md text-neutral-400 hover:text-white">iPad (768px)</button>
        <button onclick="setViewMode('desktop')" id="btn-mode-desktop" class="px-2.5 py-1 rounded-md text-neutral-400 hover:text-white">MacBook (1440px)</button>
      </div>
    </div>

    <!-- Right: Drawer Toggles & Radar Trigger -->
    <div class="flex items-center gap-2">
      <!-- Defect Inspector Toggle -->
      <button onclick="toggleDefectsDrawer()" id="btn-defects" class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-medium text-neutral-300 transition-all flex items-center gap-1.5 border border-white/10">
        <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-amber-400"></i>
        <span>Defects</span>
        <span id="defect-count-badge" class="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono text-neutral-300">0</span>
      </button>

      <!-- Model Gateway Copilot Toggle -->
      <button onclick="toggleGatewayDrawer()" id="btn-gateway" class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-medium text-neutral-300 transition-all flex items-center gap-1.5 border border-white/10">
        <i data-lucide="bot" class="w-3.5 h-3.5 text-blue-400"></i>
        <span>Model Gateway</span>
      </button>

      <!-- Run Radar Audit -->
      <button onclick="runAudit()" id="audit-btn" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-medium text-white transition-all flex items-center gap-1.5 shadow-md">
        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
        <span>Run VibeRadar</span>
      </button>

      <!-- Universal Handoff Snapshot -->
      <button onclick="openHandoffModal()" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all flex items-center gap-1.5 border border-white/10">
        <i data-lucide="arrow-left-right" class="w-3.5 h-3.5"></i>
        <span>Handoff</span>
      </button>
    </div>
  </header>

  <!-- Workspace Shell: Main Canvas + Collapsible Right Drawers -->
  <div class="flex-1 flex overflow-hidden relative">

    <!-- Center: Interactive Split-View Vibe Canvas -->
    <main id="canvas-container" class="flex-1 bg-canvas overflow-x-auto overflow-y-auto p-8 flex items-center justify-start gap-8 scrollbar-subtle transition-all">
      <div id="canvas-scaler" class="flex items-start justify-start gap-8 origin-top-left transition-transform duration-200">
        
        <!-- Device 1: iPhone 15 Pro (393 × 852) -->
        <div id="frame-mobile" class="device-viewport flex flex-col items-center shrink-0">
          <div class="text-[11px] font-mono text-neutral-400 mb-2 flex items-center justify-between w-[393px] px-1">
            <div class="flex items-center gap-1.5">
              <i data-lucide="smartphone" class="w-3.5 h-3.5 text-neutral-400"></i>
              <span class="font-medium text-neutral-300">iPhone 15 Pro</span>
            </div>
            <span class="text-[10px] text-neutral-500">393 × 852 px</span>
          </div>
          <div class="w-[393px] h-[800px] bg-black rounded-[46px] border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col ring-1 ring-white/10">
            <!-- Dynamic Island -->
            <div class="w-24 h-4 bg-neutral-900 rounded-full mx-auto mt-2.5 mb-1.5 shrink-0 flex items-center justify-center">
              <div class="w-2.5 h-2.5 rounded-full bg-black/80 ml-auto mr-2"></div>
            </div>
            <iframe id="iframe-mobile" src="${initialFrameSrc}" class="w-full flex-1 border-0 bg-white"></iframe>
            <!-- Home Indicator -->
            <div class="w-32 h-1 bg-neutral-600 rounded-full mx-auto mb-2 shrink-0"></div>
          </div>
        </div>

        <!-- Device 2: iPad Air / Mini (768 × 1024) -->
        <div id="frame-tablet" class="device-viewport flex flex-col items-center shrink-0">
          <div class="text-[11px] font-mono text-neutral-400 mb-2 flex items-center justify-between w-[540px] px-1">
            <div class="flex items-center gap-1.5">
              <i data-lucide="tablet" class="w-3.5 h-3.5 text-neutral-400"></i>
              <span class="font-medium text-neutral-300">iPad Portrait</span>
            </div>
            <span class="text-[10px] text-neutral-500">768 × 1024 (Scaled)</span>
          </div>
          <div class="w-[540px] h-[800px] bg-black rounded-[36px] border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col ring-1 ring-white/10">
            <!-- Camera Cutout -->
            <div class="w-2.5 h-2.5 bg-neutral-800 rounded-full mx-auto mt-2 mb-1.5 shrink-0"></div>
            <iframe id="iframe-tablet" src="${initialFrameSrc}" class="w-full flex-1 border-0 bg-white"></iframe>
            <div class="w-36 h-1 bg-neutral-600 rounded-full mx-auto mb-2 shrink-0"></div>
          </div>
        </div>

        <!-- Device 3: MacBook Pro (1440 × 900) -->
        <div id="frame-desktop" class="device-viewport flex flex-col items-center shrink-0">
          <div class="text-[11px] font-mono text-neutral-400 mb-2 flex items-center justify-between w-[860px] px-1">
            <div class="flex items-center gap-1.5">
              <i data-lucide="laptop" class="w-3.5 h-3.5 text-neutral-400"></i>
              <span class="font-medium text-neutral-300">MacBook Retina</span>
            </div>
            <span class="text-[10px] text-neutral-500">1440 × 900 (Scaled)</span>
          </div>
          <div class="w-[860px] h-[800px] bg-neutral-900 rounded-2xl border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col ring-1 ring-white/10">
            <!-- Window Title Bar -->
            <div class="h-7 bg-neutral-800/90 flex items-center px-3.5 gap-2 shrink-0 border-b border-neutral-700/80">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
              <span class="text-[11px] font-mono text-neutral-400 mx-auto">localhost · 1440px Desktop Breakpoint</span>
            </div>
            <iframe id="iframe-desktop" src="${initialFrameSrc}" class="w-full flex-1 border-0 bg-white"></iframe>
          </div>
        </div>

      </div>
    </main>

    <!-- Drawer 1: Real-Time DOM Defect Inspector -->
    <aside id="drawer-defects" class="w-96 border-l border-white/10 glass-panel flex flex-col h-full z-20 transition-all duration-300 transform translate-x-0" style="display: none;">
      <div class="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <i data-lucide="alert-circle" class="w-4 h-4 text-amber-400"></i>
          <h2 class="font-semibold text-sm text-white">Visual Defect Inspector</h2>
        </div>
        <button onclick="toggleDefectsDrawer()" class="text-neutral-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="p-3 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs">
        <span class="text-neutral-400">Active Radar Defects:</span>
        <button onclick="runAutoFix()" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-medium text-[11px] transition-all flex items-center gap-1">
          <i data-lucide="wand-2" class="w-3 h-3"></i>
          <span>1-Click Self-Heal</span>
        </button>
      </div>

      <div id="defects-list" class="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-subtle">
        <!-- Rendered dynamically -->
        <div class="text-center py-12 text-neutral-400 text-xs">
          <i data-lucide="check-circle" class="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80"></i>
          <p class="font-medium text-neutral-200">No layout regressions detected.</p>
          <p class="text-neutral-500 mt-1">Run VibeRadar to inspect viewports for overflow, contrast, and voids.</p>
        </div>
      </div>
    </aside>

    <!-- Drawer 2: Sovereign Model Gateway Copilot -->
    <aside id="drawer-gateway" class="w-96 border-l border-white/10 glass-panel flex flex-col h-full z-20 transition-all duration-300 transform translate-x-0" style="display: none;">
      <div class="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <i data-lucide="bot" class="w-4 h-4 text-blue-400"></i>
          <h2 class="font-semibold text-sm text-white">Model Gateway Copilot</h2>
        </div>
        <button onclick="toggleGatewayDrawer()" class="text-neutral-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Model Provider Switcher Bar -->
      <div class="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs">
        <span class="text-neutral-400 text-[11px]">Provider:</span>
        <select id="gateway-provider-select" onchange="onProviderChange()" class="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none">
          <option value="heuristic">Heuristic (Offline)</option>
          <option value="ollama">Ollama (Local)</option>
          <option value="anthropic">Claude 3.5</option>
          <option value="openai">OpenAI GPT</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>

      <!-- Chat History Stream -->
      <div id="gateway-chat-history" class="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-subtle text-xs">
        <div class="bg-white/5 rounded-xl p-3 border border-white/10 text-neutral-300">
          <div class="flex items-center gap-1.5 text-blue-400 font-semibold mb-1">
            <i data-lucide="sparkles" class="w-3 h-3"></i>
            <span>Kanso Sovereign Copilot</span>
          </div>
          <p>I can analyze visual defects, formulate Tailwind CSS patches, or draft universal handoffs for Claude, Cursor, and Codex.</p>
        </div>
      </div>

      <!-- Quick Action Chips -->
      <div class="px-4 py-2 border-t border-white/5 flex gap-1.5 overflow-x-auto scrollbar-hidden">
        <button onclick="sendQuickPrompt('Analyze the current visual defects and propose responsive Tailwind patches')" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-neutral-300 shrink-0 border border-white/10">Analyze Defects</button>
        <button onclick="sendQuickPrompt('Generate a clean universal handoff summary of recent workspace changes')" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-neutral-300 shrink-0 border border-white/10">Draft Handoff</button>
        <button onclick="sendQuickPrompt('Explain WCAG contrast requirements for dark mode themes')" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-neutral-300 shrink-0 border border-white/10">Contrast Rules</button>
      </div>

      <!-- Input Bar -->
      <div class="p-3 border-t border-white/10 flex items-center gap-2 bg-black/40 shrink-0">
        <input id="gateway-input" type="text" placeholder="Ask Copilot or request layout repair..." class="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500/50" onkeydown="if(event.key==='Enter') sendGatewayMessage()">
        <button onclick="sendGatewayMessage()" id="gateway-send-btn" class="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all">
          <i data-lucide="send" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </aside>

  </div>

  <script>
    lucide.createIcons();

    let currentScale = 1.0;
    let latestReportData = null;

    function setZoom(scale) {
      currentScale = scale;
      const scaler = document.getElementById('canvas-scaler');
      scaler.style.transform = 'scale(' + scale + ')';
    }

    function getFrameSrc(rawUrl) {
      if (!rawUrl) return '';
      if (rawUrl.startsWith('http://localhost') || rawUrl.startsWith('http://127.0.0.1')) {
        return rawUrl;
      }
      return '/proxy?url=' + encodeURIComponent(rawUrl);
    }

    function updateCanvasUrl() {
      const url = document.getElementById('target-input').value;
      const frameSrc = getFrameSrc(url);
      document.getElementById('iframe-mobile').src = frameSrc;
      document.getElementById('iframe-tablet').src = frameSrc;
      document.getElementById('iframe-desktop').src = frameSrc;
    }

    function setViewMode(mode) {
      const mobile = document.getElementById('frame-mobile');
      const tablet = document.getElementById('frame-tablet');
      const desktop = document.getElementById('frame-desktop');
      const buttons = ['all', 'mobile', 'tablet', 'desktop'];

      buttons.forEach(b => {
        const btn = document.getElementById('btn-mode-' + b);
        if (b === mode) {
          btn.className = 'px-2.5 py-1 rounded-md bg-white text-black font-semibold';
        } else {
          btn.className = 'px-2.5 py-1 rounded-md text-neutral-400 hover:text-white';
        }
      });

      if (mode === 'all') {
        mobile.style.display = 'flex';
        tablet.style.display = 'flex';
        desktop.style.display = 'flex';
      } else if (mode === 'mobile') {
        mobile.style.display = 'flex';
        tablet.style.display = 'none';
        desktop.style.display = 'none';
      } else if (mode === 'tablet') {
        mobile.style.display = 'none';
        tablet.style.display = 'flex';
        desktop.style.display = 'none';
      } else if (mode === 'desktop') {
        mobile.style.display = 'none';
        tablet.style.display = 'none';
        desktop.style.display = 'flex';
      }
    }

    function toggleDefectsDrawer() {
      const drawer = document.getElementById('drawer-defects');
      const gatewayDrawer = document.getElementById('drawer-gateway');
      if (drawer.style.display === 'none' || !drawer.style.display) {
        drawer.style.display = 'flex';
        gatewayDrawer.style.display = 'none';
      } else {
        drawer.style.display = 'none';
      }
    }

    function toggleGatewayDrawer() {
      const drawer = document.getElementById('drawer-gateway');
      const defectsDrawer = document.getElementById('drawer-defects');
      if (drawer.style.display === 'none' || !drawer.style.display) {
        drawer.style.display = 'flex';
        defectsDrawer.style.display = 'none';
      } else {
        drawer.style.display = 'none';
      }
    }

    async function runAudit() {
      const btn = document.getElementById('audit-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Auditing...</span>';
      lucide.createIcons();
      const url = document.getElementById('target-input').value;

      try {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        latestReportData = data;
        renderReport(data);
      } catch (err) {
        console.error(err);
        alert('Audit failed: ' + err.message);
      } finally {
        btn.innerHTML = originalText;
        lucide.createIcons();
      }
    }

    function renderReport(report) {
      if (!report) return;
      if (report.overallScore !== undefined) {
        const scoreEl = document.getElementById('vibescore-val');
        scoreEl.innerText = report.overallScore;

        const pill = document.getElementById('vibescore-pill');
        if (report.overallScore >= 90) {
          pill.className = 'flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 cursor-pointer hover:bg-emerald-500/15 transition-all';
        } else if (report.overallScore >= 75) {
          pill.className = 'flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-emerald-500/20 text-xs font-semibold text-amber-400 cursor-pointer hover:bg-amber-500/15 transition-all';
        } else {
          pill.className = 'flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 cursor-pointer hover:bg-rose-500/15 transition-all';
        }
      }

      const issues = report.issues || [];
      const badge = document.getElementById('defect-count-badge');
      badge.innerText = issues.length;

      const listEl = document.getElementById('defects-list');
      if (issues.length === 0) {
        listEl.innerHTML = \`
          <div class="text-center py-12 text-neutral-400 text-xs">
            <i data-lucide="check-circle" class="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80"></i>
            <p class="font-medium text-neutral-200">No layout regressions detected.</p>
            <p class="text-neutral-500 mt-1">Layout passes all contrast, mobile overflow, and whitespace checks.</p>
          </div>
        \`;
      } else {
        listEl.innerHTML = issues.map((iss, i) => \`
          <div class="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all text-xs">
            <div class="flex items-center justify-between mb-1.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold \${iss.severity === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}">\${iss.type.replace('_', ' ')}</span>
              <span class="text-[10px] font-mono text-neutral-400">\${iss.viewport}</span>
            </div>
            <div class="font-mono text-[11px] text-white bg-black/40 px-2 py-1 rounded border border-white/5 truncate mb-1.5" title="\${iss.elementSelector}">
              \${iss.elementSelector}
            </div>
            <p class="text-neutral-300 text-[11px] mb-2">\${iss.summary}</p>
            <div class="p-2 rounded bg-black/30 border border-white/5 text-[10px] text-emerald-300 font-mono">
              💡 \${iss.recommendation}
            </div>
          </div>
        \`).join('');
      }
      lucide.createIcons();
    }

    async function runAutoFix() {
      try {
        const res = await fetch('/api/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ai: false })
        });
        const data = await res.json();
        alert('Self-healing formulation complete: ' + (data.actions ? data.actions.length : 0) + ' repairs formulated and logged.');
      } catch (err) {
        alert('Self-healing failed: ' + err.message);
      }
    }

    async function sendGatewayMessage() {
      const input = document.getElementById('gateway-input');
      const prompt = input.value.trim();
      if (!prompt) return;

      const history = document.getElementById('gateway-chat-history');
      const provider = document.getElementById('gateway-provider-select').value;

      // Append user prompt
      const userBubble = document.createElement('div');
      userBubble.className = 'bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-neutral-100 ml-4';
      userBubble.innerHTML = '<div class="text-[10px] text-blue-300 font-mono mb-1">You</div><p>' + escapeHtml(prompt) + '</p>';
      history.appendChild(userBubble);
      input.value = '';
      history.scrollTop = history.scrollHeight;

      // Append typing bubble
      const botBubble = document.createElement('div');
      botBubble.className = 'bg-white/5 border border-white/10 rounded-xl p-3 text-neutral-300 mr-4';
      botBubble.innerHTML = '<div class="text-[10px] text-neutral-400 font-mono mb-1">' + provider.toUpperCase() + ' COPILOT</div><p class="italic text-neutral-500">Formulating response...</p>';
      history.appendChild(botBubble);
      history.scrollTop = history.scrollHeight;

      try {
        const res = await fetch('/api/gateway/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, provider })
        });
        const data = await res.json();
        if (data.content) {
          botBubble.innerHTML = '<div class="text-[10px] text-emerald-400 font-mono mb-1">' + data.provider.toUpperCase() + ' (' + (data.durationMs || 0) + 'ms)</div><div class="whitespace-pre-wrap font-sans text-[11px] leading-relaxed">' + formatMarkdown(data.content) + '</div>';
        } else {
          botBubble.innerHTML = '<div class="text-[10px] text-red-400 font-mono mb-1">ERROR</div><p class="text-red-300">' + (data.error || 'Unknown gateway error') + '</p>';
        }
      } catch (err) {
        botBubble.innerHTML = '<div class="text-[10px] text-red-400 font-mono mb-1">NETWORK ERROR</div><p class="text-red-300">' + err.message + '</p>';
      } finally {
        history.scrollTop = history.scrollHeight;
        lucide.createIcons();
      }
    }

    function sendQuickPrompt(text) {
      document.getElementById('gateway-input').value = text;
      sendGatewayMessage();
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function formatMarkdown(str) {
      return escapeHtml(str)
        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre class="bg-black/50 p-2 rounded border border-white/10 my-1 font-mono text-[10px] overflow-x-auto">$1</pre>')
        .replace(/\`(.*?)\`/g, '<code class="bg-black/40 px-1 py-0.5 rounded text-emerald-300 font-mono text-[10px]">$1</code>');
    }

    function openHandoffModal() {
      const task = prompt('Enter description for agent handoff snapshot:', 'Visual audit iteration');
      if (task) {
        fetch('/api/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task })
        }).then(r => r.json()).then(data => {
          alert('Handoff snapshot generated successfully at .kanso/handoff.patch');
        });
      }
    }

    // Load initial status on boot
    fetch('/api/status').then(r => r.json()).then(data => {
      if (data.latestReport) {
        renderReport(data.latestReport);
      }
    }).catch(console.error);
  </script>
</body>
</html>`;
}
