/**
 * Kanso Studio Engine
 * Sovereign Local Developer HUD & Tri-Device Visual Canvas (localhost:3100).
 * Apple-grade design, synchronized viewports, real-time VibeRadar & multi-agent handoff.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { runVibeTest, VibeReport } from "./vibe.js";
import { createHandoff, handoffStatus, resumeHandoff } from "./handoff.js";
import { loadMemories, remember } from "./memory.js";
import { detectHardware } from "../utils/hardware.js";
import { log } from "../utils/logger.js";

export function startStudioServer(targetUrl: string = "http://localhost:5173", opts: { port?: number; open?: boolean } = {}) {
  const port = opts.port || 3100;

  let latestReport: VibeReport | null = null;
  const reportPath = path.join(process.cwd(), ".kanso/vibe-reports/vibe-report.md");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // API Routes
    if (url.pathname === "/api/status") {
      const hw = detectHardware();
      const memories = loadMemories();
      const status = handoffStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          project: path.basename(process.cwd()),
          targetUrl,
          hardware: hw,
          memoryCount: memories.length,
          handoff: status,
          latestReport,
        })
      );
      return;
    }

    if (url.pathname === "/api/audit" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const auditUrl = parsed.url || targetUrl;
          latestReport = await runVibeTest(auditUrl);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(latestReport));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/handoff" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const payload = createHandoff({ task: parsed.task || "Studio manual snapshot" });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/memories") {
      const memories = loadMemories();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(memories));
      return;
    }

    // Serve Studio GUI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(generateStudioHtml(targetUrl, port));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  });

  server.listen(port, () => {
    log.header("Kanso Studio", `Sovereign Developer HUD running on http://localhost:${port}`);
    log.item("Target App", targetUrl);
    log.item("Visual Canvas", "iPhone 15 Pro (393px) · iPad (768px) · MacBook (1440px)");
    log.item("Architecture", "100% Localhost · Zero Cloud Telemetry");
    console.log(`\n  👉 Open http://localhost:${port} in your browser (Press Ctrl+C to stop)\n`);

    if (opts.open !== false) {
      const openCmd = process.platform === "darwin" ? `open http://localhost:${port}` : `xdg-open http://localhost:${port}`;
      exec(openCmd, () => {});
    }
  });

  return server;
}

function generateStudioHtml(defaultTarget: string, port: number): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanso Studio (簡素) — Sovereign Visual Canvas & Agent HUD</title>
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
            sans: ['Inter', '-apple-system', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            canvas: '#08080a',
            surface: '#121216',
            surfaceCard: '#18181f',
            borderSubtle: 'rgba(255, 255, 255, 0.08)',
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #08080a; color: #f3f4f6; overflow: hidden; height: 100vh; }
    .glass-nav {
      background: rgba(18, 18, 22, 0.85);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .device-viewport {
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .scrollbar-hidden::-webkit-scrollbar { display: none; }
  </style>
</head>
<body class="flex flex-col h-screen select-none font-sans">

  <!-- Top Studio HUD Bar -->
  <header class="glass-nav h-14 px-5 flex items-center justify-between shrink-0 z-30">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center font-bold text-xs text-white">
          簡
        </div>
        <span class="font-bold text-sm tracking-tight text-white">Kanso Studio</span>
      </div>

      <div class="h-4 w-px bg-white/10"></div>

      <!-- Target URL Bar -->
      <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <input id="target-input" type="text" value="${defaultTarget}" class="bg-transparent text-xs font-mono text-white focus:outline-none w-64">
        <button onclick="updateCanvasUrl()" class="text-[11px] text-neutral-400 hover:text-white transition-colors">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>

    <!-- Center: Live VibeScore Indicator -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400">
        <i data-lucide="shield-check" class="w-4 h-4"></i>
        <span>VibeScore™: <span id="vibescore-val">100</span>/100</span>
      </div>

      <div class="flex items-center p-0.5 rounded-lg bg-white/5 border border-white/10 text-xs">
        <button onclick="setViewMode('all')" id="btn-mode-all" class="px-2.5 py-1 rounded-md bg-white text-black font-semibold">Tri-Device</button>
        <button onclick="setViewMode('mobile')" id="btn-mode-mobile" class="px-2.5 py-1 rounded-md text-neutral-400 hover:text-white">Mobile</button>
        <button onclick="setViewMode('tablet')" id="btn-mode-tablet" class="px-2.5 py-1 rounded-md text-neutral-400 hover:text-white">Tablet</button>
        <button onclick="setViewMode('desktop')" id="btn-mode-desktop" class="px-2.5 py-1 rounded-md text-neutral-400 hover:text-white">Desktop</button>
      </div>
    </div>

    <!-- Right: Action Buttons -->
    <div class="flex items-center gap-2.5">
      <button onclick="runAudit()" id="audit-btn" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-medium text-white transition-all flex items-center gap-1.5 shadow-md">
        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
        <span>Run VibeRadar</span>
      </button>

      <button onclick="openHandoffModal()" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all flex items-center gap-1.5 border border-white/10">
        <i data-lucide="arrow-left-right" class="w-3.5 h-3.5"></i>
        <span>Handoff</span>
      </button>
    </div>
  </header>

  <!-- Main Canvas Area -->
  <main id="canvas-container" class="flex-1 bg-canvas overflow-x-auto overflow-y-hidden p-6 flex items-center justify-start gap-8 scrollbar-hidden">
    
    <!-- Device 1: iPhone 15 Pro (393 × 852) -->
    <div id="frame-mobile" class="device-viewport flex flex-col items-center shrink-0">
      <div class="text-[11px] font-mono text-neutral-400 mb-2 flex items-center gap-2">
        <i data-lucide="smartphone" class="w-3.5 h-3.5"></i>
        <span>iPhone 15 Pro (393px)</span>
      </div>
      <div class="w-[393px] h-[780px] bg-black rounded-[42px] border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col">
        <!-- Dynamic Island -->
        <div class="w-24 h-4 bg-neutral-900 rounded-full mx-auto mt-2 mb-1 shrink-0"></div>
        <iframe id="iframe-mobile" src="${defaultTarget}" class="w-full flex-1 border-0 bg-white"></iframe>
        <div class="w-32 h-1 bg-neutral-700 rounded-full mx-auto mb-2 shrink-0"></div>
      </div>
    </div>

    <!-- Device 2: iPad Mini / Air (768 × 1024 scaled) -->
    <div id="frame-tablet" class="device-viewport flex flex-col items-center shrink-0">
      <div class="text-[11px] font-mono text-neutral-400 mb-2 flex items-center gap-2">
        <i data-lucide="tablet" class="w-3.5 h-3.5"></i>
        <span>iPad 768px</span>
      </div>
      <div class="w-[520px] h-[780px] bg-black rounded-[36px] border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col">
        <div class="w-3 h-3 bg-neutral-800 rounded-full mx-auto mt-2 mb-1 shrink-0"></div>
        <iframe id="iframe-tablet" src="${defaultTarget}" class="w-full flex-1 border-0 bg-white"></iframe>
        <div class="w-32 h-1 bg-neutral-700 rounded-full mx-auto mb-2 shrink-0"></div>
      </div>
    </div>

    <!-- Device 3: MacBook Pro (1440 × 900 scaled) -->
    <div id="frame-desktop" class="device-viewport flex flex-col items-center shrink-0">
      <div class="text-[11px] font-mono text-neutral-400 mb-2 flex items-center gap-2">
        <i data-lucide="laptop" class="w-3.5 h-3.5"></i>
        <span>MacBook Retina (1440px)</span>
      </div>
      <div class="w-[840px] h-[780px] bg-neutral-900 rounded-2xl border-4 border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col">
        <!-- Window Bar -->
        <div class="h-6 bg-neutral-800 flex items-center px-3 gap-1.5 shrink-0 border-b border-neutral-700">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span class="text-[10px] font-mono text-neutral-400 mx-auto">localhost</span>
        </div>
        <iframe id="iframe-desktop" src="${defaultTarget}" class="w-full flex-1 border-0 bg-white"></iframe>
      </div>
    </div>

  </main>

  <script>
    lucide.createIcons();

    function updateCanvasUrl() {
      const url = document.getElementById('target-input').value;
      document.getElementById('iframe-mobile').src = url;
      document.getElementById('iframe-tablet').src = url;
      document.getElementById('iframe-desktop').src = url;
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

    async function runAudit() {
      const btn = document.getElementById('audit-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>Auditing...</span>';
      const url = document.getElementById('target-input').value;

      try {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.overallScore !== undefined) {
          document.getElementById('vibescore-val').innerText = data.overallScore;
        }
      } catch (err) {
        console.error(err);
      } finally {
        btn.innerHTML = originalText;
        lucide.createIcons();
      }
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
  </script>
</body>
</html>`;
}
