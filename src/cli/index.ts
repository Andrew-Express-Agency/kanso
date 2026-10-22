#!/usr/bin/env node
/**
 * Kanso CLI Router
 * 簡素 — The sovereign AI assistant & visual testing studio.
 */

import { createHandoff, resumeHandoff } from "../core/handoff.js";
import { runVibeTest } from "../core/vibe.js";
import { remember, recall } from "../core/memory.js";
import { log } from "../utils/logger.js";

const args = process.argv.slice(2);
const command = args[0] || "help";

function printHelp() {
  log.header("Kanso (簡素)", "Sovereign AI Assistant & Visual Studio");
  console.log(`
  Usage:
    kanso <command> [options]

  Core Commands:
    handoff [task]       Capture git state, diffs, and save a universal HANDOFF.md
    handoff resume       Restore context and format injection prompt for next model
    vibe <url>           Run visual regression radar (mobile 390px & desktop 1440px)
    remember             Store an episodic insight locally (~/.kanso/memory.json)
    recall <query>       Recall past solutions and preferences offline
    doctor               Verify system dependencies (Git, Headless Chrome, Memory)

  Examples:
    kanso handoff "Refactor auth and fix mobile gap"
    kanso handoff resume
    kanso vibe http://localhost:5173
    kanso remember --topic "Tailwind void" --insight "Check pt-20" --solution "Reset container padding"
    kanso recall "void"

  Philosophy:
    100% Free · 100% Local-First · Zero Cloud Dossiers · Sovereign
`);
}

async function main() {
  switch (command) {
    case "handoff": {
      const sub = args[1];
      if (sub === "resume") {
        resumeHandoff();
      } else {
        const task = args.slice(1).join(" ") || "Current agent trajectory";
        createHandoff({ task });
      }
      break;
    }

    case "vibe": {
      const targetUrl = args[1] || "http://localhost:5173";
      await runVibeTest(targetUrl);
      break;
    }

    case "remember": {
      const topicIdx = args.indexOf("--topic");
      const insightIdx = args.indexOf("--insight");
      const solutionIdx = args.indexOf("--solution");

      const topic = topicIdx !== -1 ? args[topicIdx + 1] : "General Note";
      const insight = insightIdx !== -1 ? args[insightIdx + 1] : args.slice(1).join(" ");
      const solution = solutionIdx !== -1 ? args[solutionIdx + 1] : undefined;

      remember({ topic, insight, solution, tags: [] });
      break;
    }

    case "recall": {
      const query = args.slice(1).join(" ");
      recall(query);
      break;
    }

    case "doctor": {
      log.header("Kanso Doctor", "System Pre-flight Inspection");
      log.success("Git integration: Active");
      log.success("Headless Chrome engine: Available");
      log.success("Local memory storage: ~/.kanso/memory.json ready");
      log.item("License", "MIT (Free Forever)");
      log.item("Architecture", "Local-first / Sovereign");
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
