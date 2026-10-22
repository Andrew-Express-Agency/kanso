#!/usr/bin/env node
/**
 * Kanso CLI Router
 * 簡素 — Sovereign AI Assistant & Visual Testing Studio.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { createHandoff, resumeHandoff, applyHandoff, handoffStatus } from "../core/handoff.js";
import { runVibeTest } from "../core/vibe.js";
import { remember, recall, listMemories, deleteMemory, loadMemories } from "../core/memory.js";
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

    vibe <url>               Run visual regression radar (mobile 393px + desktop 1440px)
    vibe <url> --html        Generate standalone interactive HTML report with screenshots

    remember                 Store an episodic insight locally (~/.kanso/memory.json)
                             Options: --topic "..." --insight "..." [--solution "..."] [--tags "..."] [--project "..."]
    recall <query>           Smart-rank and recall past engineering insights offline
    memory list              List recent episodic memories
    memory delete <id>       Remove an outdated memory entry

    doctor                   System audit (Git, Headless Chrome, Node, Memory Storage)

  Examples:
    kanso handoff "Refactor auth and fix mobile gap"
    kanso handoff apply
    kanso vibe http://localhost:5173 --html
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
      } else {
        const task = args.slice(1).join(" ") || "Current agent trajectory";
        createHandoff({ task });
      }
      break;
    }

    case "vibe": {
      const targetUrl = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:5173";
      const openHtml = args.includes("--open");
      await runVibeTest(targetUrl, { openHtml });
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

      // 4. Memory storage check
      const kansoHome = path.join(os.homedir(), ".kanso");
      const memoryFile = path.join(kansoHome, "memory.json");
      if (fs.existsSync(memoryFile)) {
        const memories = loadMemories();
        const stat = fs.statSync(memoryFile);
        log.success(`Local Memory Store: ${memoryFile} (${memories.length} entries, ${(stat.size / 1024).toFixed(1)} KB)`);
      } else {
        log.info(`Local Memory Store: Ready at ${memoryFile} (empty)`);
      }

      // 5. Working tree check
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
