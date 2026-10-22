/**
 * Kanso Handoff & Diff Restore E2E Test Suite
 * Tests full cycle: Git modification -> Diff snapshot -> Wipe tree -> Apply patch -> Restore
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createHandoff, applyHandoff, resumeHandoff, handoffStatus } from "../src/core/handoff.js";

console.log("\n── Running Kanso Handoff 2.0 & Diff Restore E2E Test Suite ──\n");

const testDir = path.join("/tmp", `kanso-handoff-e2e-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

const originalCwd = process.cwd();

try {
  process.chdir(testDir);

  // 1. Initialize Git repository
  execSync("git init", { stdio: "ignore" });
  execSync("git config user.name 'Kanso Tester'", { stdio: "ignore" });
  execSync("git config user.email 'tester@kanso.sh'", { stdio: "ignore" });

  // 2. Initial commit with .gitignore
  const gitignore = path.join(testDir, ".gitignore");
  fs.writeFileSync(gitignore, ".kanso/\n", "utf-8");
  const file1 = path.join(testDir, "app.ts");
  fs.writeFileSync(file1, "export const appName = 'Original';\n", "utf-8");
  execSync("git add .gitignore app.ts && git commit -m 'feat: initial commit'", { stdio: "ignore" });
  console.log("1. Initialized test git repository with initial commit ✓");

  // 3. Make intentional modifications
  fs.writeFileSync(file1, "export const appName = 'Modified by Agent A';\nexport const version = '2.0.0';\n", "utf-8");
  const file2 = path.join(testDir, "utils.ts");
  fs.writeFileSync(file2, "export function helper() { return true; }\n", "utf-8");
  execSync("git add utils.ts", { stdio: "ignore" }); // Staged change
  console.log("2. Created staged and unstaged code modifications ✓");

  // 4. Create Handoff Snapshot
  console.log("3. Creating Handoff 2.0 snapshot...");
  const handoff = createHandoff({
    task: "Refactor appName and add helper utility",
    agent: "agent-alpha",
    status: "in_progress",
    next: ["Run integration tests", "Deploy to staging"],
  });

  assert.strictEqual(handoff.status, "in_progress");
  assert.ok(fs.existsSync(path.join(testDir, "HANDOFF.md")), "HANDOFF.md must be generated");
  assert.ok(fs.existsSync(path.join(testDir, ".kanso/handoff.json")), ".kanso/handoff.json must exist");
  assert.ok(fs.existsSync(path.join(testDir, ".kanso/handoff.patch")), ".kanso/handoff.patch must exist");
  console.log("  ✓ Snapshot metadata and diff patch generated successfully\n");

  // 5. Test Status & Resume Prompt
  console.log("4. Verifying status inspection & resume prompt...");
  const status = handoffStatus();
  assert.ok(status !== null, "Handoff status must return active payload");
  assert.strictEqual(status.task, "Refactor appName and add helper utility");

  const prompt = resumeHandoff();
  assert.ok(prompt && prompt.includes("[KANSO RESUME]"), "Must generate injection prompt");
  console.log("  ✓ Status and resume prompt verified\n");

  // 6. Simulate Workspace Wipe (Disaster recovery or model switch)
  console.log("5. Simulating catastrophic context loss (git reset --hard HEAD)...");
  execSync("git reset --hard HEAD", { stdio: "ignore" });
  execSync("git clean -fd", { stdio: "ignore" });

  const wipedContent = fs.readFileSync(file1, "utf-8");
  assert.strictEqual(wipedContent, "export const appName = 'Original';\n", "Workspace must be reset to original state");
  assert.strictEqual(fs.existsSync(file2), false, "Staged file must be removed");
  console.log("  ✓ Workspace wiped clean (back to HEAD commit)\n");

  // 7. Apply Handoff Patch to Restore State
  console.log("6. Applying handoff diff snapshot via 'kanso handoff apply'...");
  const applied = applyHandoff();
  assert.strictEqual(applied, true, "applyHandoff must succeed cleanly");

  const restoredContent = fs.readFileSync(file1, "utf-8");
  assert.ok(restoredContent.includes("Modified by Agent A"), "Modified file must be restored");
  assert.ok(restoredContent.includes("version = '2.0.0'"), "New lines must be restored");
  console.log("  ✓ 100% of uncommitted code changes restored from .kanso/handoff.patch!\n");

  console.log("✅ All Kanso Handoff E2E tests passed successfully!\n");
} catch (err) {
  console.error("❌ Handoff E2E Failure:", err);
  process.exitCode = 1;
} finally {
  process.chdir(originalCwd);
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
}
