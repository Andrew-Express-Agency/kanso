/**
 * Kanso Studio Phase 2 Test Suite
 * Validates Studio server lifecycle, API endpoints, Visual Defect Inspector,
 * Model Gateway Copilot, and native HTML rendering.
 */

import http from "http";
import { startStudioServer } from "../src/core/studio.js";

async function runStudioTests() {
  console.log("\n── Running Kanso Studio Phase 2 & Native Shell Test Suite ──\n");

  const testPort = 3188;
  const targetApp = "http://localhost:5173";

  console.log(`1. Launching Kanso Studio server on port ${testPort}...`);
  const server = startStudioServer(targetApp, { port: testPort, open: false, app: false });

  // Wait for server to bind
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // 2. Test GET /api/status
    console.log("2. Testing GET /api/status...");
    const statusRes = await fetch(`http://localhost:${testPort}/api/status`);
    if (!statusRes.ok) throw new Error(`GET /api/status failed with ${statusRes.status}`);
    const statusData = (await statusRes.json()) as any;
    if (!statusData.project || !statusData.hardware || !Array.isArray(statusData.gateway)) {
      throw new Error(`Invalid status data: ${JSON.stringify(statusData)}`);
    }
    console.log(`  ✓ Status endpoint verified (Project: ${statusData.project}, Gateway providers: ${statusData.gateway.length})`);

    // 3. Test GET /api/gateway/status
    console.log("\n3. Testing GET /api/gateway/status...");
    const gwRes = await fetch(`http://localhost:${testPort}/api/gateway/status`);
    if (!gwRes.ok) throw new Error(`GET /api/gateway/status failed with ${gwRes.status}`);
    const gwData = (await gwRes.json()) as any[];
    if (!Array.isArray(gwData) || gwData.length < 4) {
      throw new Error(`Expected at least 4 providers, got ${gwData.length}`);
    }
    console.log(`  ✓ Gateway endpoint verified (${gwData.length} providers reported)`);

    // 4. Test POST /api/gateway/chat
    console.log("\n4. Testing POST /api/gateway/chat (Sovereign Heuristic)...");
    const chatRes = await fetch(`http://localhost:${testPort}/api/gateway/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "How do I fix horizontal scroll on iPhone with Tailwind?", provider: "heuristic" }),
    });
    if (!chatRes.ok) throw new Error(`POST /api/gateway/chat failed with ${chatRes.status}`);
    const chatData = (await chatRes.json()) as any;
    if (!chatData.content || !chatData.content.includes("Mobile Viewport Overflow")) {
      throw new Error(`Unexpected chat response: ${JSON.stringify(chatData)}`);
    }
    console.log(`  ✓ Chat endpoint verified (Duration: ${chatData.durationMs}ms, Provider: ${chatData.provider})`);

    // 5. Test POST /api/fix
    console.log("\n5. Testing POST /api/fix (Automated CSS self-healing)...");
    const fixRes = await fetch(`http://localhost:${testPort}/api/fix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai: false }),
    });
    if (!fixRes.ok) throw new Error(`POST /api/fix failed with ${fixRes.status}`);
    const fixData = (await fixRes.json()) as any;
    if (!Array.isArray(fixData.actions)) {
      throw new Error(`Invalid fix actions: ${JSON.stringify(fixData)}`);
    }
    console.log(`  ✓ Fix endpoint verified (${fixData.actions.length} action(s) formulated)`);

    // 6. Test GET / (HTML Rendering of Phase 2 Studio Canvas)
    console.log("\n6. Testing GET / (Phase 2 Studio HTML & Native Canvas)...");
    const htmlRes = await fetch(`http://localhost:${testPort}/`);
    if (!htmlRes.ok) throw new Error(`GET / failed with ${htmlRes.status}`);
    const html = await htmlRes.text();

    const expectedTokens = [
      "Kanso Studio",
      "Phase 2",
      "iPhone 15 Pro",
      "iPad",
      "MacBook Retina",
      "Visual Defect Inspector",
      "Model Gateway Copilot",
      "mac-traffic-dot",
      "VibeScore™",
      "1-Click Self-Heal",
    ];

    for (const token of expectedTokens) {
      if (!html.includes(token)) {
        throw new Error(`Missing expected element "${token}" in Studio HTML`);
      }
    }
    console.log(`  ✓ All ${expectedTokens.length} Phase 2 canvas and inspector elements verified in HTML`);

    console.log("\n✅ All Kanso Studio Phase 2 tests passed successfully!\n");
  } finally {
    console.log("Shutting down test studio server...");
    server.close();
  }
}

runStudioTests().catch((err) => {
  console.error("❌ Studio Test failed:", err);
  process.exit(1);
});
