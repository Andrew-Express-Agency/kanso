/**
 * Kanso Automated Self-Healing Engine
 * Reads VibeTest visual regression reports and applies precision CSS repairs.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "../utils/logger.js";

export interface FixAction {
  issueType: string;
  selector: string;
  file?: string;
  line?: number;
  originalText?: string;
  proposedFix: string;
  applied: boolean;
}

export function runSelfHealing(opts: { dryRun?: boolean } = {}): FixAction[] {
  log.header("Kanso Self-Heal", "Analyzing VibeTest visual defects & formulating repairs");

  const cwd = process.cwd();
  const reportMdPath = path.join(cwd, ".kanso/vibe-reports/vibe-report.md");

  if (!fs.existsSync(reportMdPath)) {
    log.warn("No active VibeTest report found at .kanso/vibe-reports/vibe-report.md.");
    log.info("Run 'kanso vibe <url>' first to detect visual defects.");
    return [];
  }

  const reportContent = fs.readFileSync(reportMdPath, "utf-8");

  if (reportContent.includes("Pristine layout") || reportContent.includes("0 issue(s) detected")) {
    log.success("No visual defects detected. Layout is already pristine (VibeScore: 100/100).");
    return [];
  }

  const actions: FixAction[] = [];

  // Parse issues from report
  const issueBlocks = reportContent.split(/### \d+\. /).slice(1);

  for (const block of issueBlocks) {
    const typeMatch = block.match(/\* \*\*Category\*\*:\s+`([^`]+)`/);
    const selMatch = block.match(/\* \*\*Selector\*\*:\s+`([^`]+)`/);
    const summaryMatch = block.match(/\[(ERROR|WARNING)\]\s+([^\n]+)/);
    const recoMatch = block.match(/\* \*\*Self-Heal Recommendation\*\*:\s+([^\n]+)/);

    const type = typeMatch ? typeMatch[1] : "unknown";
    const selector = selMatch ? selMatch[1] : "";
    const summary = summaryMatch ? summaryMatch[2] : "";
    const recommendation = recoMatch ? recoMatch[1] : "";

    let proposed = recommendation;
    if (type === "viewport_overflow") {
      proposed = `Add 'max-w-full overflow-hidden' to selector '${selector}' or make desktop elements hidden on mobile ('hidden md:flex').`;
    } else if (type === "whitespace_void") {
      proposed = `Reduce container padding on mobile: replace large static padding with responsive classes (e.g. 'pt-16 sm:pt-24').`;
    } else if (type === "invisible_contrast") {
      proposed = `Elevate text color on '${selector}' to high-contrast white (#ffffff) or text-neutral-200.`;
    }

    actions.push({
      issueType: type,
      selector,
      proposedFix: proposed,
      applied: false,
    });
  }

  log.item("Defects Detected", `${actions.length} issue(s) parsed from report`);

  console.log("\n  ── Formulated Repair Plan ──\n");
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    console.log(`  ${i + 1}. [${act.issueType.toUpperCase()}] Selector: \`${act.selector}\``);
    console.log(`     Action: ${act.proposedFix}\n`);
  }

  log.box("Agent Self-Healing Prompt", [
    "Inject this self-healing batch into Claude, Cursor, or your local model:",
    "",
    `kanso handoff "Auto-repair visual regressions: ${actions.map((a) => a.issueType).join(", ")}"`,
  ]);

  return actions;
}
