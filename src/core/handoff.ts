/**
 * Kanso Handoff Engine
 * The universal save-state and context bridge for AI coding agents.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "../utils/logger.js";

export interface HandoffPayload {
  version: "1.0";
  timestamp: string;
  project: string;
  agent: string;
  task: string;
  status: "done" | "in_progress" | "blocked";
  branch: string;
  commit: string;
  filesTouched: string[];
  nextSteps: string[];
  blockers?: string[];
  evidence?: string[];
}

function runGit(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function createHandoff(opts: {
  task?: string;
  status?: "done" | "in_progress" | "blocked";
  next?: string[];
  blockers?: string[];
  agent?: string;
}) {
  log.header("Handoff", "Serializing agent trajectory & git state");

  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  const branch = runGit("rev-parse --abbrev-ref HEAD") || "unknown";
  const commit = runGit("rev-parse HEAD") || "uncommitted";
  const commitMsg = runGit("log -1 --pretty=%B") || "";

  // Files modified / staged / untracked
  const statusOutput = runGit("status --porcelain");
  const touchedFiles: string[] = [];
  if (statusOutput) {
    const lines = statusOutput.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const file = line.substring(3).trim();
      touchedFiles.push(file);
    }
  }

  const payload: HandoffPayload = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    project: projectName,
    agent: opts.agent || process.env.USER || "agent",
    task: opts.task || "Current task trajectory",
    status: opts.status || (touchedFiles.length > 0 ? "in_progress" : "done"),
    branch,
    commit,
    filesTouched: touchedFiles,
    nextSteps: opts.next && opts.next.length > 0 ? opts.next : ["Verify recent changes and run test suite"],
    blockers: opts.blockers || [],
  };

  // Generate clean HANDOFF.md
  const markdown = `# HANDOFF — ${payload.project} — ${payload.agent} — ${payload.timestamp}

## Task
${payload.task}

## Status
**${payload.status.toUpperCase()}**

## Git State
* **Branch**: \`${payload.branch}\`
* **Commit**: \`${payload.commit.slice(0, 10)}\`${commitMsg ? ` — *"${commitMsg.split("\n")[0]}"*` : ""}

## Files Touched
${
  payload.filesTouched.length > 0
    ? payload.filesTouched.map((f) => `* \`${f}\``).join("\n")
    : "*No uncommitted file changes.*"
}

## Next Steps
${payload.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${
  payload.blockers && payload.blockers.length > 0
    ? `\n## Blockers\n${payload.blockers.map((b) => `* ⚠️ ${b}`).join("\n")}`
    : ""
}
`;

  // Write HANDOFF.md
  const handoffMdPath = path.join(cwd, "HANDOFF.md");
  fs.writeFileSync(handoffMdPath, markdown, "utf-8");

  // Write .kanso/handoff.json
  const kansoDir = path.join(cwd, ".kanso");
  if (!fs.existsSync(kansoDir)) {
    fs.mkdirSync(kansoDir, { recursive: true });
  }
  fs.writeFileSync(path.join(kansoDir, "handoff.json"), JSON.stringify(payload, null, 2), "utf-8");

  log.success(`Generated ${handoffMdPath}`);
  log.success(`Saved snapshot to .kanso/handoff.json`);
  log.item("Project", payload.project);
  log.item("Branch", payload.branch);
  log.item("Status", payload.status);
  log.item("Files Touched", `${payload.filesTouched.length} file(s)`);

  return payload;
}

export function resumeHandoff(): string | null {
  log.header("Handoff Resume", "Restoring previous agent state");

  const cwd = process.cwd();
  const jsonPath = path.join(cwd, ".kanso/handoff.json");
  const mdPath = path.join(cwd, "HANDOFF.md");

  let payload: HandoffPayload | null = null;

  if (fs.existsSync(jsonPath)) {
    try {
      payload = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    } catch {
      // Fallback
    }
  }

  if (!payload && fs.existsSync(mdPath)) {
    log.info("Reading context from HANDOFF.md");
    const content = fs.readFileSync(mdPath, "utf-8");
    log.box("HANDOFF.md Found", [
      "Copy and paste this resume prompt into your next agent session:",
      "",
      `Resume task based on HANDOFF.md in workspace root.`,
      `Verified branch & status. Proceed to Next Steps.`,
    ]);
    return content;
  }

  if (!payload) {
    log.warn("No active handoff found in this directory (checked .kanso/handoff.json and HANDOFF.md).");
    return null;
  }

  const currentBranch = runGit("rev-parse --abbrev-ref HEAD");
  const branchMatch = currentBranch === payload.branch;

  log.item("Project", payload.project);
  log.item("Target Branch", payload.branch);
  log.item("Active Branch", currentBranch + (branchMatch ? " (aligned)" : " (mismatch!)"));
  log.item("Last Agent", payload.agent);
  log.item("Recorded Status", payload.status);

  const promptInjection = `[KANSO RESUME] Continuing project ${payload.project} from ${payload.agent}.
Task: ${payload.task}
Branch: ${payload.branch}
Status: ${payload.status}
Files Touched: ${payload.filesTouched.join(", ") || "none"}
Next Action: ${payload.nextSteps.join(" -> ")}
`;

  log.box("Agent Resume Prompt", [
    "Inject this prompt into your next model (Claude, Cursor, Codex, Gemini):",
    "",
    promptInjection.trim(),
  ]);

  return promptInjection;
}
