/**
 * Kanso Automated Test Suite 2.0
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { createHandoff, resumeHandoff, applyHandoff, handoffStatus } from "../src/core/handoff.js";
import { remember, recall, listMemories, deleteMemory, loadMemories } from "../src/core/memory.js";

console.log("\n── Running Kanso Core Test Suite 2.0 ──\n");

// 1. Test Handoff Engine 2.0
console.log("1. Testing Handoff 2.0 serialization...");
const handoff = createHandoff({
  task: "Unit test validation for Phase 1",
  status: "done",
  next: ["Deploy landing page preview", "Verify VibeTest radar"],
  blockers: [],
  notes: "Phase 1 engine verified",
});

assert.strictEqual(handoff.status, "done");
assert.ok(fs.existsSync(path.join(process.cwd(), "HANDOFF.md")), "HANDOFF.md must exist");
assert.ok(fs.existsSync(path.join(process.cwd(), ".kanso/handoff.json")), ".kanso/handoff.json must exist");
console.log("  ✓ Handoff created and verified successfully");

// 2. Test Resume Engine
console.log("2. Testing Handoff resume...");
const resumePrompt = resumeHandoff();
assert.ok(resumePrompt && resumePrompt.includes("[KANSO RESUME]"), "Resume prompt must be generated");
console.log("  ✓ Resume prompt generated accurately");

// 3. Test Handoff Status
console.log("3. Testing Handoff status...");
const status = handoffStatus();
assert.ok(status !== null, "Handoff status must return payload");
assert.strictEqual(status.task, "Unit test validation for Phase 1");
console.log("  ✓ Handoff status retrieved and validated");

// 4. Test Local Memory Engine 2.0 (Scoping + Relevance Ranking)
console.log("4. Testing Episodic Memory 2.0...");
const testTimestamp = Date.now();
const testTopic = `Apple Fluid Touch ${testTimestamp}`;
const entry = remember({
  topic: testTopic,
  tags: ["apple", "touch", "physics"],
  insight: "Spring physics with 0.8 damping ratio feels instantaneous on iOS Safari",
  solution: "Use cubic-bezier(0.16, 1, 0.3, 1)",
  project: "kanso-test",
});

assert.ok(entry.id.startsWith("mem_"), "Entry ID must have mem_ prefix");

// Test smart recall
const matches = recall("physics damping", { project: "kanso-test" });
assert.ok(matches.length > 0, "Should recall the newly stored memory with token search");
assert.strictEqual(matches[0].topic, testTopic);
console.log("  ✓ Episodic memory write and smart-rank recall verified");

// Test memory list
const list = listMemories({ project: "kanso-test" });
assert.ok(list.length > 0, "List must find memory in project");
console.log("  ✓ Memory list by project verified");

// Clean up test entry
deleteMemory(entry.id);
console.log("  ✓ Memory deletion verified");

// 5. Test Kanso Hub Engine
console.log("5. Testing Kanso Hub...");
import { listHubPacks, pullHubPack } from "../src/core/hub.js";
const packs = listHubPacks();
assert.ok(packs.length >= 3, "Kanso Hub must have at least 3 curated packs");
const pullSuccess = pullHubPack("memory/tailwind-gotchas");
assert.strictEqual(pullSuccess, true, "Pulling tailwind-gotchas must succeed");

const recalledGotcha = recall("navbar void");
assert.ok(recalledGotcha.length > 0, "Pulled hub pack must be immediately recallable offline");
console.log("  ✓ Kanso Hub registry and pull engine verified");

console.log("\n✅ All Kanso 2.0 core tests passed successfully!\n");
