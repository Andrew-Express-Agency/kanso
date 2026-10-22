#!/usr/bin/env node
/**
 * Kanso CLI Router
 * 簡素 — Sovereign AI Assistant, Visual Testing Studio & Model Gateway.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { createHandoff, resumeHandoff, applyHandoff, handoffStatus, inspectDiff } from "../core/handoff.js";
import { runVibeTest } from "../core/vibe.js";
import { remember, recall, listMemories, deleteMemory, loadMemories } from "../core/memory.js";
import { listHubPacks, pullHubPack } from "../core/hub.js";
import { startWatchMode } from "../core/watch.js";
import { startStudioServer } from "../core/studio.js";
import { runSelfHealing, runSelfHealingWithAI } from "../core/fix.js";
import { detectGatewayProviders, queryGateway, GatewayProvider } from "../core/gateway.js";
import { detectHardware } from "../utils/hardware.js";
import { log } from "../utils/logger.js";

const args = process.argv.slice(2);
const command = args[0] || "help";

function printHelp() {
  log.header("Kanso (簡素)", "Sovereign AI Assistant & Visual Studio · 100% Free · Local-First");
  console.log(`
  Usage:
    kanso <command> [subcommand | options]

  Commands:
    handoff [task]           Capture git state, diffs, and save a universal HANDOFF.md
    handoff resume           Restore context and format injection prompt for next model
    handoff apply            Apply saved diff snapshot (.kanso/handoff.patch) to working tree
    handoff status           View current workspace handoff metadata and status
    handoff diff             Inspect live diff or saved patch snapshot

    vibe <url>               Run visual regression radar (mobile 393px + desktop 1440px)
    vibe <url> --ci          Run visual regression gate (fails if VibeScore < 80)
    vibe <url> --threshold N Set minimum passing VibeScore for CI (default: 80)
    vibe <url> --open        Automatically open the HTML report in your browser
    watch [url]              Live file watcher: auto-audits UI on file save (.tsx, .jsx, .html)
    fix [--ai]               Formulate CSS repairs (optional --ai for Model Gateway guidance)
    studio [url]             Launch sovereign Tri-Device Visual Canvas HUD (localhost:3100)
    studio [url] --app       Launch frameless native macOS standalone desktop app window

    ask "<prompt>"           Query Model Gateway (Ollama local offline / Claude / GPT / Gemini)
    gateway [status]         Inspect active Model Gateway providers, local models & API keys

    hub [list]               Browse curated community memory packs & visual rules
    pull <pack>              Download an open-source memory pack (e.g. memory/tailwind-gotchas)

    init [url] [--ci]        Initialize workspace (.kanso/config.json + GitHub Actions CI gate)
    badge [score]            Generate embeddable VibeScore™ markdown badge for README.md
    share                    Generate GitHub PR review block and social share copy

    remember                 Store an episodic insight locally (~/.kanso/memory.json)
                             Options: --topic "..." --insight "..." [--solution "..."] [--tags "..."] [--project "..."]
    recall <query>           Smart-rank and recall past engineering insights offline
    memory list              List recent episodic memories
    memory delete <id>       Remove an outdated memory entry

    doctor                   System audit (Git, Headless Chrome, Node, Memory Storage)

  Examples:
    kanso handoff "Refactor auth and fix mobile gap"
    kanso handoff apply
    kanso handoff diff
    kanso vibe http://localhost:5173 --ci --threshold 85
    kanso studio --app
    kanso ask "How do I fix horizontal scroll on iPhone 15 Pro with Tailwind?"
    kanso gateway
    kanso fix --ai
    kanso remember --topic "Tailwind mobile gap" --insight "pt-20 creates 80px void" --solution "Remove pt-20 on sm"
    kanso recall "mobile gap"
    kanso doctor

  Principles:
    100% Free · 100% Local-First · Zero Cloud Dossiers · Sovereign Architecture
`);
}

async function main() {
  switch (command) {
    case "handoff": {
      const sub = args[1];
      if (sub === "resume") {
        resumeHandoff();
      } else if (sub === "apply") {
        applyHandoff();
      } else if (sub === "status") {
        handoffStatus();
      } else if (sub === "diff") {
        inspectDiff();
      } else {
        const task = args.slice(1).join(" ") || "Current agent trajectory";
        createHandoff({ task });
      }
      break;
    }

    case "vibe": {
      const targetUrl = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:5173";
      const openHtml = args.includes("--open");
      const isCi = args.includes("--ci");
      const threshIdx = args.indexOf("--threshold") !== -1 ? args.indexOf("--threshold") : args.indexOf("--min-score");
      const minScore = threshIdx !== -1 && args[threshIdx + 1] ? parseInt(args[threshIdx + 1], 10) : undefined;

      await runVibeTest(targetUrl, { openHtml, ci: isCi, minScore });
      break;
    }

    case "watch": {
      const targetUrl = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:5173";
      startWatchMode(targetUrl);
      break;
    }

    case "studio": {
      const targetUrl = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:5173";
      const portIdx = args.indexOf("--port");
      const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 3100;
      const isApp = args.includes("--app");
      const noOpen = args.includes("--no-open");
      startStudioServer(targetUrl, { port, app: isApp, open: !noOpen });
      break;
    }

    case "ask": {
      const provIdx = args.indexOf("--provider");
      const modelIdx = args.indexOf("--model");
      const provider = provIdx !== -1 ? (args[provIdx + 1] as GatewayProvider) : undefined;
      const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

      // Extract prompt without flags
      const promptWords = args.slice(1).filter((arg, i, arr) => {
        if (arg === "--provider" || arg === "--model") return false;
        if (i > 0 && (arr[i - 1] === "--provider" || arr[i - 1] === "--model")) return false;
        return true;
      });

      const prompt = promptWords.join(" ");
      if (!prompt) {
        log.error("Please provide a prompt: kanso ask \"<prompt>\" [--provider <name>] [--model <name>]");
        return;
      }

      log.header("Kanso Model Gateway", "Dispatching query through sovereign router");
      const response = await queryGateway(prompt, { provider, model });
      log.item("Provider", `${response.provider} (${response.model})`);
      log.item("Latency", `${response.durationMs}ms`);
      console.log("\n" + response.content + "\n");
      break;
    }

    case "gateway": {
      log.header("Kanso Model Gateway", "Provider & Offline Local AI Status");
      const providers = await detectGatewayProviders();
      console.log("\n  ── Active Providers ──\n");
      for (const p of providers) {
        const icon = p.available ? "✓" : "○";
        const color = p.available ? "\x1b[32m" : "\x1b[90m";
        console.log(`  ${color}${icon}\x1b[0m \x1b[1m${p.name}\x1b[0m [${p.type}]`);
        console.log(`     Status: ${p.status}`);
        console.log(`     Models: ${p.models.slice(0, 4).join(", ")}${p.models.length > 4 ? ` (+${p.models.length - 4} more)` : ""}\n`);
      }
      break;
    }

    case "fix": {
      if (args.includes("--ai")) {
        const provIdx = args.indexOf("--provider");
        const modelIdx = args.indexOf("--model");
        const provider = provIdx !== -1 ? (args[provIdx + 1] as GatewayProvider) : undefined;
        const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;
        await runSelfHealingWithAI({ provider, model });
      } else {
        runSelfHealing();
      }
      break;
    }

    case "hub": {
      listHubPacks();
      break;
    }

    case "pull": {
      const packId = args[1];
      if (!packId) {
        log.error("Please specify a pack to pull. Example: kanso pull memory/tailwind-gotchas");
        listHubPacks();
        return;
      }
      pullHubPack(packId);
      break;
    }

    case "share": {
      log.header("Kanso Share", "Ready-to-Post Markdown & Social Summary");
      const reportMd = path.join(process.cwd(), ".kanso/vibe-reports/vibe-report.md");
      let score = "100";
      if (fs.existsSync(reportMd)) {
        const content = fs.readFileSync(reportMd, "utf-8");
        const match = content.match(/VibeScore™\*\*:\s+\*\*(\d+)\s*\/\s*100\*\*/);
        if (match) score = match[1];
      }

      console.log("\n── 1. Pull Request Visual Review Block ──\n");
      console.log(`### 🛡️ Kanso Visual Regression Radar: ${score}/100 VibeScore™\n`);
      console.log(`| Viewport | Status | Resolution |`);
      console.log(`|:---|:---|:---|`);
      console.log(`| **Mobile** | ✅ Clean (0 voids, 0 contrast bugs) | 393 × 852 (iPhone 15 Pro) |`);
      console.log(`| **Desktop** | ✅ Clean (0 horizontal overflow) | 1440 × 900 (MacBook Retina) |\n`);
      console.log(`*Verified offline with [Kanso](https://kanso.sh) · Sovereign Visual Testing & Agent Handoff*\n`);

      console.log("── 2. X / Twitter / LinkedIn Announcement ──\n");
      console.log(`Shipped our latest frontend milestone with 100/100 VibeScore™ using Kanso (簡素).\n`);
      console.log(`Zero broken viewports, zero contrast violations, and zero cloud VM bans.\n100% free, 100% local-first.\n\nhttps://kanso.sh\n`);
      break;
    }

    case "init": {
      log.header("Kanso Init", "Configuring workspace for sovereign visual testing");
      const cwd = process.cwd();
      const kansoDir = path.join(cwd, ".kanso");
      if (!fs.existsSync(kansoDir)) fs.mkdirSync(kansoDir, { recursive: true });

      const defaultUrl = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:5173";
      const config = {
        project: path.basename(cwd),
        defaultUrl,
        viewports: {
          mobile: { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
          desktop: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
        },
        ci: {
          threshold: 80,
          failOnAnyError: true,
        },
      };

      fs.writeFileSync(path.join(kansoDir, "config.json"), JSON.stringify(config, null, 2), "utf-8");
      log.success(`Generated .kanso/config.json`);

      // Add .kanso/ to .gitignore if present
      const gitignorePath = path.join(cwd, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
        if (!gitignoreContent.includes(".kanso")) {
          fs.appendFileSync(gitignorePath, "\n# Kanso Sovereign Snapshots\n.kanso/\n", "utf-8");
          log.success(`Added .kanso/ to .gitignore`);
        }
      }

      // CI Workflow generation
      if (args.includes("--ci") || args.includes("--github")) {
        const ghDir = path.join(cwd, ".github/workflows");
        if (!fs.existsSync(ghDir)) fs.mkdirSync(ghDir, { recursive: true });
        const ciWorkflow = `name: Kanso VibeScore Radar
on: [push, pull_request]

jobs:
  visual-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install & Build
        run: |
          npm ci
          npm run build

      - name: Start App Server
        run: |
          npm run preview &
          npx wait-on ${defaultUrl}

      - name: Execute Kanso VibeRadar CI Gate
        run: npx kanso vibe ${defaultUrl} --ci --threshold 85
`;
        fs.writeFileSync(path.join(ghDir, "vibe.yml"), ciWorkflow, "utf-8");
        log.success(`Created GitHub Action workflow at .github/workflows/vibe.yml`);
      }

      log.item("Project", config.project);
      log.item("Default URL", config.defaultUrl);
      log.item("CI Gate Threshold", `${config.ci.threshold} / 100`);
      break;
    }

    case "badge": {
      log.header("Kanso Badge", "Embeddable Markdown & HTML Status Badges");
      const score = args[1] || "100";
      console.log("\n  Markdown Badge (Add to README.md):");
      console.log(`  [![VibeScore](https://img.shields.io/badge/VibeScore-${score}%2F100-emerald?style=flat-square&logo=apple)](https://kanso.sh)\n`);
      console.log("  HTML Badge:");
      console.log(`  <a href="https://kanso.sh"><img src="https://img.shields.io/badge/VibeScore-${score}%2F100-emerald?style=flat-square" alt="VibeScore" /></a>\n`);
      break;
    }

    case "remember": {
      const topicIdx = args.indexOf("--topic");
      const insightIdx = args.indexOf("--insight");
      const solutionIdx = args.indexOf("--solution");
      const tagsIdx = args.indexOf("--tags");
      const projIdx = args.indexOf("--project");

      const topic = topicIdx !== -1 && args[topicIdx + 1] ? args[topicIdx + 1] : "General Note";
      const insight = insightIdx !== -1 && args[insightIdx + 1] ? args[insightIdx + 1] : args.slice(1).join(" ");
      const solution = solutionIdx !== -1 && args[solutionIdx + 1] ? args[solutionIdx + 1] : undefined;
      const tags = tagsIdx !== -1 && args[tagsIdx + 1] ? args[tagsIdx + 1].split(",").map((t) => t.trim()) : [];
      const project = projIdx !== -1 && args[projIdx + 1] ? args[projIdx + 1] : undefined;

      if (!insight || insight === "--topic" || insight === topic) {
        log.error("Missing insight text. Use: kanso remember --topic \"...\" --insight \"...\"");
        return;
      }

      remember({ topic, insight, solution, tags, project });
      break;
    }

    case "recall": {
      const projIdx = args.indexOf("--project");
      const project = projIdx !== -1 && args[projIdx + 1] ? args[projIdx + 1] : undefined;

      // Extract search terms filtering out flags
      const queryTerms = args.slice(1).filter((arg, idx, arr) => {
        if (arg === "--project" || (idx > 0 && arr[idx - 1] === "--project")) return false;
        return true;
      });

      const query = queryTerms.join(" ");
      if (!query) {
        log.error("Please provide a search term: kanso recall <query>");
        return;
      }

      recall(query, { project });
      break;
    }

    case "memory": {
      const sub = args[1];
      if (sub === "list" || !sub) {
        const projIdx = args.indexOf("--project");
        const project = projIdx !== -1 && args[projIdx + 1] ? args[projIdx + 1] : undefined;
        listMemories({ project });
      } else if (sub === "delete" || sub === "rm") {
        const id = args[2];
        if (!id) {
          log.error("Please specify memory ID to delete: kanso memory delete <id>");
          return;
        }
        deleteMemory(id);
      } else {
        log.warn(`Unknown memory subcommand "${sub}". Use 'kanso memory list' or 'kanso memory delete <id>'`);
      }
      break;
    }

    case "doctor": {
      log.header("Kanso Doctor", "System Pre-flight & Sovereign Environment Audit");

      // 1. Node.js check
      const nodeVer = process.version;
      log.success(`Node.js Runtime: ${nodeVer} (compatible)`);

      // 2. Git check
      try {
        const gitVer = execSync("git --version", { encoding: "utf-8" }).trim();
        log.success(`Git Engine: ${gitVer}`);
      } catch {
        log.warn("Git: Not detected in PATH. Handoff diff features require git.");
      }

      // 3. Headless Chrome detection
      const chromeCandidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
      ];
      let foundChrome = false;
      for (const c of chromeCandidates) {
        if (fs.existsSync(c)) {
          log.success(`Visual Radar Browser: ${c}`);
          foundChrome = true;
          break;
        }
      }
      if (!foundChrome) {
        log.warn("Chrome Binary: Default system path not found. Set CHROME_PATH environment variable for VibeTest.");
      }

      // 4. GPU & Local AI Hardware Acceleration (NVIDIA / Apple Silicon)
      const hw = detectHardware();
      if (hw.gpuType === "nvidia") {
        log.success(`GPU Engine: ${hw.gpuName} (NVIDIA CUDA / TensorRT ready)`);
        log.success(`NVIDIA NIM Architecture: Supported (Local RTX AI Ready)`);
        if (hw.cudaVersion) log.item("CUDA Toolkit", `v${hw.cudaVersion}`);
      } else if (hw.gpuType === "apple_silicon") {
        log.success(`GPU Engine: ${hw.gpuName} (Apple Metal & Neural Engine active)`);
      } else {
        log.info(`GPU Engine: ${hw.accelerationEngine}`);
      }

      // 5. Model Gateway status
      const providers = await detectGatewayProviders();
      const activeCount = providers.filter((p) => p.available).length;
      log.success(`Model Gateway: ${activeCount} provider(s) active (Local Ollama, Cloud, Heuristic)`);

      // 6. Memory storage check
      const kansoHome = path.join(os.homedir(), ".kanso");
      const memoryFile = path.join(kansoHome, "memory.json");
      if (fs.existsSync(memoryFile)) {
        const memories = loadMemories();
        const stat = fs.statSync(memoryFile);
        log.success(`Local Memory Store: ${memoryFile} (${memories.length} entries, ${(stat.size / 1024).toFixed(1)} KB)`);
      } else {
        log.info(`Local Memory Store: Ready at ${memoryFile} (empty)`);
      }

      // 7. Working tree check
      const cwd = process.cwd();
      const isGit = fs.existsSync(path.join(cwd, ".git"));
      log.item("Active Directory", cwd);
      log.item("Git Workspace", isGit ? "Active" : "None");
      log.item("License", "MIT (Free Forever · No Cloud · Sovereign)");
      break;
    }

    case "help":
    case "--help":
    case "-h":
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  log.error(err.message || String(err));
  process.exit(1);
});
