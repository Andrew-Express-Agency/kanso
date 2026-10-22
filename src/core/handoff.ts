/**
 * Kanso Handoff Engine 2.0
 * Sovereign save-state, diff serialization, and universal context bridge for AI agents.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "../utils/logger.js";

export interface HandoffFileChange {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked" | "renamed";
}

export interface HandoffPayload {
  version: "2.0";
  timestamp: string;
  project: string;
  agent: string;
  task: string;
  status: "done" | "in_progress" | "blocked";
  branch: string;
  commit: string;
  commitMessage?: string;
  filesTouched: HandoffFileChange[];
  patchFile?: string;
  nextSteps: string[];
  blockers?: string[];
  notes?: string;
}

function runGit(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

export function parseGitStatus(): HandoffFileChange[] {
  const rawStatus = runGit("status --porcelain");
  if (!rawStatus) return [];

  const changes: HandoffFileChange[] = [];
  const lines = rawStatus.split("\n");

  for (const line of lines) {
    if (!line || line.length < 3) continue;

    const indexCode = line.charAt(0);
    const worktreeCode = line.charAt(1);
    const filePath = line.substring(3).trim();

    if (!filePath) continue;

    let status: HandoffFileChange["status"] = "modified";
    if (indexCode === "?" && worktreeCode === "?") {
      status = "untracked";
    } else if (indexCode === "A" || worktreeCode === "A") {
      status = "added";
    } else if (indexCode === "D" || worktreeCode === "D") {
      status = "deleted";
    } else if (indexCode === "R" || worktreeCode === "R") {
      status = "renamed";
    } else {
      status = "modified";
    }

    changes.push({ path: filePath, status });
  }

  return changes;
}

export function createHandoff(opts: {
  task?: string;
  status?: "done" | "in_progress" | "blocked";
  next?: string[];
  blockers?: string[];
  agent?: string;
  notes?: string;
}): HandoffPayload {
  log.header("Handoff 2.0", "Serializing agent trajectory, git state & diff patch");

  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  const branch = runGit("rev-parse --abbrev-ref HEAD").trim() || "unknown";
  const commit = runGit("rev-parse HEAD").trim() || "uncommitted";
  const commitMsg = runGit("log -1 --pretty=%B").trim();

  // Get full file breakdown
  const filesTouched = parseGitStatus();

  // Capture git diff against HEAD (both staged and unstaged)
  const kansoDir = path.join(cwd, ".kanso");
  if (!fs.existsSync(kansoDir)) {
    fs.mkdirSync(kansoDir, { recursive: true });
  }

  const patchContent = runGit("diff HEAD");
  const patchFileName = "handoff.patch";
  const patchFilePath = path.join(kansoDir, patchFileName);

  let hasPatch = false;
  if (patchContent.trim().length > 0) {
    fs.writeFileSync(patchFilePath, patchContent, "utf-8");
    hasPatch = true;
  } else if (fs.existsSync(patchFilePath)) {
    // If working tree is now clean, remove outdated patch
    fs.unlinkSync(patchFilePath);
  }

  const payload: HandoffPayload = {
    version: "2.0",
    timestamp: new Date().toISOString(),
    project: projectName,
    agent: opts.agent || process.env.USER || "agent",
    task: opts.task || "Current task trajectory",
    status: opts.status || (filesTouched.length > 0 ? "in_progress" : "done"),
    branch,
    commit,
    commitMessage: commitMsg || undefined,
    filesTouched,
    patchFile: hasPatch ? `.kanso/${patchFileName}` : undefined,
    nextSteps: opts.next && opts.next.length > 0 ? opts.next : ["Verify recent changes and run test suite"],
    blockers: opts.blockers || [],
    notes: opts.notes,
  };

  // Generate clean, human-readable HANDOFF.md
  const markdown = `# HANDOFF — ${payload.project} — ${payload.agent} — ${payload.timestamp}

## Task
${payload.task}

## Status
**${payload.status.toUpperCase()}**

## Git State
* **Branch**: \`${payload.branch}\`
* **Commit**: \`${payload.commit.slice(0, 10)}\`${commitMsg ? ` — *"${commitMsg.split("\n")[0]}"*` : ""}
${hasPatch ? `* **Diff Snapshot**: \`.kanso/${patchFileName}\` (ready for \`kanso handoff apply\`)` : ""}

## Files Touched (${payload.filesTouched.length})
${
  payload.filesTouched.length > 0
    ? payload.filesTouched.map((f) => `* \`[${f.status.toUpperCase()}]\` \`${f.path}\``).join("\n")
    : "*Clean working tree. No uncommitted modifications.*"
}

## Next Steps
${payload.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${
  payload.blockers && payload.blockers.length > 0
    ? `\n## Blockers\n${payload.blockers.map((b) => `* ⚠️ ${b}`).join("\n")}`
    : ""
}
${
  payload.notes
    ? `\n## Additional Notes\n${payload.notes}`
    : ""
}
`;

  // Write HANDOFF.md in root
  const handoffMdPath = path.join(cwd, "HANDOFF.md");
  fs.writeFileSync(handoffMdPath, markdown, "utf-8");

  // Write .kanso/handoff.json
  fs.writeFileSync(path.join(kansoDir, "handoff.json"), JSON.stringify(payload, null, 2), "utf-8");

  log.success(`Generated ${handoffMdPath}`);
  log.success(`Saved metadata to .kanso/handoff.json`);
  if (hasPatch) {
    log.success(`Preserved git diff snapshot to .kanso/${patchFileName}`);
  }

  log.item("Project", payload.project);
  log.item("Branch", payload.branch);
  log.item("Status", payload.status);
  log.item("Files Changed", `${payload.filesTouched.length} file(s)`);

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
      // Fallback to md
    }
  }

  if (!payload && fs.existsSync(mdPath)) {
    log.info("Reading context directly from HANDOFF.md");
    const content = fs.readFileSync(mdPath, "utf-8");
    log.box("HANDOFF.md Detected", [
      "Use this prompt to seamlessly instruct the next AI agent session:",
      "",
      `Resume task based on HANDOFF.md in workspace root.`,
      `Inspect Next Steps and verified branch state.`,
    ]);
    return content;
  }

  if (!payload) {
    log.warn("No active handoff found in this directory (checked .kanso/handoff.json and HANDOFF.md).");
    return null;
  }

  const currentBranch = runGit("rev-parse --abbrev-ref HEAD").trim();
  const branchMatch = currentBranch === payload.branch;

  log.item("Project", payload.project);
  log.item("Target Branch", payload.branch);
  log.item("Active Branch", currentBranch + (branchMatch ? " (aligned)" : " (mismatch warning!)"));
  log.item("Origin Agent", payload.agent);
  log.item("Recorded Status", payload.status);
  if (payload.patchFile && fs.existsSync(path.join(cwd, payload.patchFile))) {
    log.item("Diff Patch", `${payload.patchFile} (Available to apply)`);
  }

  const fileSummary = payload.filesTouched.map((f) => `${f.path} (${f.status})`).join(", ") || "none";

  const promptInjection = `[KANSO RESUME] Continuing project ${payload.project} from ${payload.agent}.
Task: ${payload.task}
Branch: ${payload.branch}
Status: ${payload.status}
Files Touched: ${fileSummary}
Next Steps: ${payload.nextSteps.join(" -> ")}
${payload.blockers && payload.blockers.length > 0 ? `Blockers: ${payload.blockers.join(" | ")}` : ""}
`;

  log.box("Agent Resume Prompt", [
    "Inject this prompt into Claude, Cursor, Codex, Gemini, or Grok:",
    "",
    promptInjection.trim(),
  ]);

  return promptInjection;
}

export function applyHandoff(): boolean {
  log.header("Handoff Apply", "Restoring code diff from snapshot");

  const cwd = process.cwd();
  const patchPath = path.join(cwd, ".kanso/handoff.patch");

  if (!fs.existsSync(patchPath)) {
    log.warn("No diff patch found at .kanso/handoff.patch. Nothing to apply.");
    return false;
  }

  // Pre-flight dry-run check with git apply --check
  try {
    execSync(`git apply --check "${patchPath}"`, { stdio: "pipe" });
  } catch (err: any) {
    log.error(`Cannot cleanly apply patch: working directory conflicts detected.`);
    log.info(`Run 'git diff' to check local modifications before applying.`);
    return false;
  }

  try {
    execSync(`git apply "${patchPath}"`, { stdio: "pipe" });
    log.success(`Successfully applied diff snapshot from .kanso/handoff.patch!`);
    
    // Display updated status
    const updatedStatus = parseGitStatus();
    log.item("Restored Files", `${updatedStatus.length} file(s) modified in working tree`);
    for (const f of updatedStatus) {
      console.log(`  • [${f.status.toUpperCase()}] ${f.path}`);
    }
    return true;
  } catch (err: any) {
    log.error(`Failed to apply patch: ${err.message || String(err)}`);
    return false;
  }
}

export function handoffStatus(): HandoffPayload | null {
  log.header("Handoff Status", "Inspecting current workspace handoff state");

  const cwd = process.cwd();
  const jsonPath = path.join(cwd, ".kanso/handoff.json");

  if (!fs.existsSync(jsonPath)) {
    log.info("No active handoff state (.kanso/handoff.json) in this workspace.");
    return null;
  }

  try {
    const payload: HandoffPayload = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    log.item("Project", payload.project);
    log.item("Task", payload.task);
    log.item("Status", payload.status.toUpperCase());
    log.item("Branch", payload.branch);
    log.item("Agent", payload.agent);
    log.item("Timestamp", payload.timestamp);
    log.item("Files Changed", `${payload.filesTouched.length} file(s)`);
    return payload;
  } catch (err) {
    log.error("Corrupted .kanso/handoff.json file.");
    return null;
  }
}

export function inspectDiff(): string {
  log.header("Handoff Diff", "Inspecting diff snapshot");

  const cwd = process.cwd();
  const patchPath = path.join(cwd, ".kanso/handoff.patch");

  if (!fs.existsSync(patchPath)) {
    log.info("No active patch found at .kanso/handoff.patch. Inspecting live git diff HEAD:");
    const liveDiff = runGit("diff HEAD");
    if (!liveDiff) {
      log.success("Working tree is completely clean relative to HEAD.");
      return "";
    }
    console.log(liveDiff);
    return liveDiff;
  }

  const patchContent = fs.readFileSync(patchPath, "utf-8");
  log.item("Patch File", ".kanso/handoff.patch");
  log.item("Patch Size", `${(Buffer.byteLength(patchContent) / 1024).toFixed(1)} KB`);
  console.log("\n" + patchContent);
  return patchContent;
}

