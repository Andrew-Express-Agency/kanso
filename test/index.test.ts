/**
 * Kanso Automated Test Suite
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { createHandoff, resumeHandoff } from "../src/core/handoff.js";
import { remember, recall, loadMemories } from "../src/core/memory.js";

console.log("\n── Running Kanso Core Test Suite ──");

// 1. Test Handoff Engine
console.log("Testing Handoff serialization...");
const handoff = createHandoff({
  task: "Unit test validation",
  status: "done",
  next: ["Deploy to production"],
  blockers: [],
});

assert.strictEqual(handoff.status, "done");
assert.ok(fs.existsSync(path.join(process.cwd(), "HANDOFF.md")), "HANDOFF.md must exist");
assert.ok(fs.existsSync(path.join(process.cwd(), ".kanso/handoff.json")), ".kanso/handoff.json must exist");
console.log("  ✓ Handoff created and verified successfully");

// 2. Test Resume Engine
console.log("Testing Handoff resume...");
const resumePrompt = resumeHandoff();
assert.ok(resumePrompt && resumePrompt.includes("[KANSO RESUME]"), "Resume prompt must be generated");
console.log("  ✓ Resume prompt generated accurately");

// 3. Test Local Memory Engine
console.log("Testing Episodic Memory...");
const testTopic = `Test Topic ${Date.now()}`;
remember({
  topic: testTopic,
  tags: ["test", "kanso"],
  insight: "Simplicity is the ultimate sophistication",
  solution: "Eliminate excess code",
});

const matches = recall(testTopic);
assert.ok(matches.length > 0, "Should recall the newly stored memory");
assert.strictEqual(matches[0].topic, testTopic);
console.log("  ✓ Episodic memory write and recall verified");

console.log("\n✅ All Kanso core tests passed successfully!\n");
