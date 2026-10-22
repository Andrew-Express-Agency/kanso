/**
 * Kanso Real-Time Watch Engine
 * Live visual regression radar watching local files and re-auditing via CDP.
 */

import fs from "fs";
import path from "path";
import { runVibeTest } from "./vibe.js";
import { log } from "../utils/logger.js";

export function startWatchMode(url: string, opts: { debounceMs?: number } = {}) {
  log.header("Kanso Watch", `Active Visual Radar for ${url}`);
  log.info("Watching workspace for code changes (.tsx, .jsx, .html, .css, .vue, .svelte)...");
  log.info("Press Ctrl+C to stop watching.\n");

  const cwd = process.cwd();
  const debounceTime = opts.debounceMs || 1000;
  let timer: NodeJS.Timeout | null = null;
  let isAuditing = false;

  const validExtensions = new Set([".tsx", ".jsx", ".ts", ".js", ".html", ".css", ".vue", ".svelte"]);

  function triggerAudit(changedFile: string) {
    if (isAuditing) return;
    isAuditing = true;

    const timeStr = new Date().toLocaleTimeString();
    console.log(`\n  [${timeStr}] ⚡️ Change detected in ${path.relative(cwd, changedFile)}`);
    console.log(`  [${timeStr}] 🔍 Running CDP Visual Radar...`);

    runVibeTest(url)
      .then((report) => {
        if (report.overallScore >= 95) {
          console.log(`  [${timeStr}] ✅ VibeScore: ${report.overallScore} / 100 (Layout Pristine)`);
        } else {
          console.log(`  [${timeStr}] ⚠️ REGRESSION DETECTED: VibeScore dropped to ${report.overallScore} / 100!`);
          if (report.issues.length > 0) {
            console.log(`               Issue: ${report.issues[0].summary}`);
          }
        }
      })
      .catch((err) => {
        console.log(`  [${timeStr}] ✕ Radar notice: ${err.message || err}`);
      })
      .finally(() => {
        isAuditing = false;
      });
  }

  // Watch directories recursively
  try {
    fs.watch(cwd, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Ignore noise
      if (
        filename.includes("node_modules") ||
        filename.includes(".git") ||
        filename.includes(".kanso") ||
        filename.includes("dist") ||
        filename.includes(".system_generated")
      ) {
        return;
      }

      const ext = path.extname(filename);
      if (!validExtensions.has(ext)) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        triggerAudit(path.join(cwd, filename));
      }, debounceTime);
    });
  } catch (err: any) {
    log.error(`Could not start file watcher: ${err.message || err}`);
  }
}
