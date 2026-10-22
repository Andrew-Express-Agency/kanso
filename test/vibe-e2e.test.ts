/**
 * Kanso VibeTest & Self-Healing E2E Test Suite
 * Tests live CDP Chrome radar against pristine and intentionally defective layouts.
 */

import http from "http";
import assert from "assert";
import fs from "fs";
import path from "path";
import { runVibeTest } from "../src/core/vibe.js";
import { runSelfHealing } from "../src/core/fix.js";

console.log("\n── Running Kanso VibeTest & CI E2E Test Suite ──\n");

const PORT = 4991;

const pristineHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pristine Layout</title>
  <style>
    body { margin: 0; background-color: #08080a; color: #ffffff; font-family: sans-serif; }
    .container { max-width: 100%; padding: 20px; box-sizing: border-box; }
    h1 { font-size: 24px; color: #ffffff; }
    p { font-size: 16px; color: #e5e7eb; }
    .box { background: #1f2937; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Pristine Sovereign App</h1>
    <p>This layout has zero mobile overflow, proper contrast, and compact spacing.</p>
    <div class="box">
      <p>Clean box content with high contrast text.</p>
    </div>
  </div>
</body>
</html>`;

const defectiveHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Defective Layout</title>
  <style>
    body { margin: 0; background-color: #08080a; color: #ffffff; font-family: sans-serif; }
    /* 1. Mobile Horizontal Overflow: explicit 600px width */
    .overflow-box { width: 600px; background: #374151; padding: 20px; }
    
    /* 2. Whitespace Void: 140px gap */
    .hero { margin-bottom: 140px; }

    /* 3. Invisible Contrast: #1f242d text on #111827 background */
    .low-contrast-text { background-color: #111827; color: #1c2331; padding: 15px; font-size: 16px; }
  </style>
</head>
<body>
  <section class="hero">
    <h1>Defective App Under Test</h1>
    <p>Testing intentional visual defects.</p>
  </section>

  <div class="overflow-box">
    <p>This element is 600px wide and deliberately breaks the 393px mobile screen boundary.</p>
  </div>

  <div class="low-contrast-text">
    This text has extremely low contrast and should be flagged as invisible.
  </div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/pristine") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pristineHtml);
  } else if (req.url === "/defective") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(defectiveHtml);
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, async () => {
  try {
    console.log("1. Testing pristine layout via CDP radar...");
    const pristineReport = await runVibeTest(`http://localhost:${PORT}/pristine`);
    assert.strictEqual(pristineReport.overallScore, 100, "Pristine page must score 100/100");
    assert.strictEqual(pristineReport.issues.length, 0, "Pristine page must have 0 issues");
    console.log("  ✓ Pristine layout achieved verified 100/100 VibeScore™\n");

    console.log("2. Testing defective layout via CDP radar...");
    const defectiveReport = await runVibeTest(`http://localhost:${PORT}/defective`);
    assert.ok(defectiveReport.overallScore < 90, `Defective page score (${defectiveReport.overallScore}) must be < 90`);
    assert.ok(defectiveReport.issues.length > 0, "Defective page must flag detected issues");

    const issueTypes = defectiveReport.issues.map((i) => i.type);
    assert.ok(issueTypes.includes("viewport_overflow"), "Must flag mobile viewport overflow");
    assert.ok(issueTypes.includes("whitespace_void"), "Must flag 140px whitespace void");
    assert.ok(issueTypes.includes("invisible_contrast"), "Must flag low-contrast text");
    console.log(`  ✓ Defective layout correctly penalized: ${defectiveReport.overallScore}/100 with ${defectiveReport.issues.length} flagged defects\n`);

    console.log("3. Testing Automated Self-Healing plan formulation...");
    const actions = runSelfHealing();
    assert.ok(actions.length > 0, "Self-healing must formulate repair actions for defective report");
    console.log(`  ✓ Formulated ${actions.length} surgical repair recommendations\n`);

    console.log("4. Testing CI Visual Regression Gate on defective layout...");
    let ciFailed = false;
    try {
      await runVibeTest(`http://localhost:${PORT}/defective`, { ci: true, minScore: 90 });
    } catch (err: any) {
      ciFailed = true;
      assert.ok(err.message.includes("threshold"), "Error message must cite threshold failure");
    }
    assert.strictEqual(ciFailed, true, "CI gate MUST throw an error when score is below 90");
    console.log("  ✓ CI Visual Gate successfully caught regression and blocked execution\n");

    console.log("5. Testing CI Visual Regression Gate on pristine layout...");
    const ciPristine = await runVibeTest(`http://localhost:${PORT}/pristine`, { ci: true, minScore: 90 });
    assert.strictEqual(ciPristine.overallScore, 100, "Pristine layout must pass CI gate");
    console.log("  ✓ CI Visual Gate passed for pristine layout\n");

    console.log("✅ All Kanso VibeTest E2E tests passed successfully!\n");
  } catch (err) {
    console.error("❌ E2E Test Failure:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
