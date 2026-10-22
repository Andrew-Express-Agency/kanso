/**
 * Kanso Model Gateway Test Suite
 * Validates provider detection, local Ollama checking, heuristic fallback, and repair plan formulation.
 */

import { detectGatewayProviders, queryGateway, generateVisualRepairPlan, checkOllama } from "../src/core/gateway.js";
import { VibeIssue } from "../src/core/vibe.js";

async function runGatewayTests() {
  console.log("\n── Running Kanso Model Gateway & Local AI Test Suite ──\n");

  // 1. Provider detection
  console.log("1. Testing Model Gateway provider detection...");
  const providers = await detectGatewayProviders();
  if (!Array.isArray(providers) || providers.length < 4) {
    throw new Error(`Expected at least 4 providers, got ${providers.length}`);
  }

  const heuristic = providers.find((p) => p.id === "heuristic");
  if (!heuristic || !heuristic.available) {
    throw new Error("Heuristic engine must always be available as sovereign baseline");
  }

  const ollama = providers.find((p) => p.id === "ollama");
  if (!ollama) {
    throw new Error("Ollama provider definition missing");
  }
  console.log(`  ✓ Detected ${providers.length} providers (Heuristic active, Ollama detected: ${ollama.status})`);

  // 2. Query gateway (heuristic fallback)
  console.log("\n2. Testing sovereign queryGateway execution...");
  const res = await queryGateway("How to eliminate 80px whitespace void on mobile with Tailwind?", {
    provider: "heuristic",
  });

  if (!res.content || !res.content.includes("Whitespace Void")) {
    throw new Error(`Unexpected heuristic response: ${res.content}`);
  }
  if (res.provider !== "heuristic" || res.durationMs < 0) {
    throw new Error(`Invalid response metadata: ${JSON.stringify(res)}`);
  }
  console.log(`  ✓ Query completed via ${res.provider} in ${res.durationMs}ms`);

  // 3. Contrast analysis query
  console.log("\n3. Testing contrast and legibility query...");
  const contrastRes = await queryGateway("Low contrast text on dark background", {
    provider: "heuristic",
  });
  if (!contrastRes.content.includes("Contrast & Legibility")) {
    throw new Error("Expected contrast analysis in response");
  }
  console.log("  ✓ Contrast heuristic analysis verified");

  // 4. Visual repair plan generation
  console.log("\n4. Testing generateVisualRepairPlan from VibeIssues...");
  const sampleIssues: VibeIssue[] = [
    {
      type: "viewport_overflow",
      severity: "error",
      viewport: "mobile (393px)",
      elementSelector: "header .nav-links",
      summary: "Element width exceeds viewport by 24px",
      recommendation: "Apply max-w-full and overflow-hidden",
    },
    {
      type: "invisible_contrast",
      severity: "warning",
      viewport: "desktop (1440px)",
      elementSelector: ".badge-tier",
      summary: "Contrast ratio 3.1:1 fails WCAG AA",
      recommendation: "Increase foreground text luminance",
    },
  ];

  const repair = await generateVisualRepairPlan(sampleIssues, { provider: "heuristic" });
  if (!repair.plan || repair.patches.length !== 2) {
    throw new Error(`Repair plan failed: ${JSON.stringify(repair)}`);
  }
  if (repair.patches[0].selector !== "header .nav-links") {
    throw new Error("Mismatched selector in repair patches");
  }
  console.log(`  ✓ Generated repair plan with ${repair.patches.length} precision patches`);

  // 5. Empty issues pristine case
  console.log("\n5. Testing pristine visual repair plan...");
  const pristine = await generateVisualRepairPlan([], { provider: "heuristic" });
  if (!pristine.plan.includes("pristine") || pristine.patches.length !== 0) {
    throw new Error("Pristine check failed");
  }
  console.log("  ✓ Pristine layout repair plan verified (0 patches)");

  console.log("\n✅ All Kanso Model Gateway tests passed successfully!\n");
}

runGatewayTests().catch((err) => {
  console.error("❌ Gateway Test failed:", err);
  process.exit(1);
});
