/**
 * Kanso Model Gateway
 * 簡素 — Sovereign Model-Agnostic Gateway & Offline Local AI Hub.
 * Connects local Ollama (100% offline, zero-telemetry) and frontier cloud models
 * with automatic sovereign heuristic fallback.
 */

import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../utils/logger.js";
import { VibeIssue } from "./vibe.js";

export type GatewayProvider = "ollama" | "anthropic" | "openai" | "gemini" | "heuristic";

export interface GatewayProviderStatus {
  id: GatewayProvider;
  name: string;
  type: "local" | "cloud" | "embedded";
  available: boolean;
  status: string;
  models: string[];
}

export interface GatewayQueryOptions {
  provider?: GatewayProvider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface GatewayResponse {
  provider: GatewayProvider;
  model: string;
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  durationMs: number;
}

/**
 * Check if local Ollama daemon is reachable and list its available models.
 */
export async function checkOllama(timeoutMs: number = 800): Promise<{ available: boolean; models: string[]; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch("http://localhost:11434/api/tags", {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (data.models || []).map((m) => m.name);
      return { available: true, models };
    }
    return { available: false, models: [], error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { available: false, models: [], error: err.message || "Unreachable" };
  }
}

/**
 * Detect all configured and active AI providers.
 */
export async function detectGatewayProviders(): Promise<GatewayProviderStatus[]> {
  const ollama = await checkOllama(600);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const providers: GatewayProviderStatus[] = [
    {
      id: "ollama",
      name: "Ollama (Local Offline)",
      type: "local",
      available: ollama.available,
      status: ollama.available
        ? `Active on localhost:11434 (${ollama.models.length} model(s) installed)`
        : "Daemon offline (Run 'ollama serve' to activate 100% local inference)",
      models: ollama.models.length > 0 ? ollama.models : ["llama3", "deepseek-coder", "mistral", "qwen2.5-coder"],
    },
    {
      id: "anthropic",
      name: "Anthropic Claude",
      type: "cloud",
      available: Boolean(anthropicKey),
      status: anthropicKey ? "Configured via ANTHROPIC_API_KEY" : "No ANTHROPIC_API_KEY found in environment",
      models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    },
    {
      id: "openai",
      name: "OpenAI GPT",
      type: "cloud",
      available: Boolean(openaiKey),
      status: openaiKey ? "Configured via OPENAI_API_KEY" : "No OPENAI_API_KEY found in environment",
      models: ["gpt-4o", "gpt-4o-mini", "o1-mini"],
    },
    {
      id: "gemini",
      name: "Google Gemini",
      type: "cloud",
      available: Boolean(geminiKey),
      status: geminiKey ? "Configured via GEMINI_API_KEY" : "No GEMINI_API_KEY found in environment",
      models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"],
    },
    {
      id: "heuristic",
      name: "Kanso Heuristic Engine",
      type: "embedded",
      available: true,
      status: "Always available (Zero-dependency sovereign offline analyzer)",
      models: ["kanso-heuristic-v2"],
    },
  ];

  return providers;
}

/**
 * Send a prompt through the Model Gateway.
 */
export async function queryGateway(prompt: string, opts: GatewayQueryOptions = {}): Promise<GatewayResponse> {
  const startTime = Date.now();
  const providers = await detectGatewayProviders();

  // Determine provider
  let targetProvider: GatewayProvider = opts.provider || "heuristic";
  if (!opts.provider) {
    // Prefer local Ollama if running, otherwise check cloud, otherwise fallback to heuristic
    const ollamaProv = providers.find((p) => p.id === "ollama");
    if (ollamaProv?.available) {
      targetProvider = "ollama";
    } else {
      const availableCloud = providers.find((p) => p.available && p.type === "cloud");
      if (availableCloud) {
        targetProvider = availableCloud.id;
      } else {
        targetProvider = "heuristic";
      }
    }
  }

  const defaultSystemPrompt =
    opts.systemPrompt ||
    "You are Kanso (簡素), an expert sovereign AI engineer and visual design specialist. Provide concise, high-signal, actionable answers with precise code examples.";

  try {
    // 1. Ollama (Localhost:11434)
    if (targetProvider === "ollama") {
      const model = opts.model || (providers.find((p) => p.id === "ollama")?.models[0] ?? "llama3");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);

      const res = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: defaultSystemPrompt },
            { role: "user", content: prompt },
          ],
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.2,
          },
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Ollama returned status ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const content = data.message?.content || "";
      return {
        provider: "ollama",
        model,
        content,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Anthropic Claude
    if (targetProvider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment.");

      const model = opts.model || "claude-3-5-sonnet-20241022";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: defaultSystemPrompt,
          messages: [{ role: "user", content: prompt }],
          temperature: opts.temperature ?? 0.2,
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const content = data.content?.[0]?.text || "";
      return {
        provider: "anthropic",
        model,
        content,
        usage: {
          promptTokens: data.usage?.input_tokens,
          completionTokens: data.usage?.output_tokens,
        },
        durationMs: Date.now() - startTime,
      };
    }

    // 3. OpenAI GPT
    if (targetProvider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set in environment.");

      const model = opts.model || "gpt-4o-mini";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: defaultSystemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: opts.temperature ?? 0.2,
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const content = data.choices?.[0]?.message?.content || "";
      return {
        provider: "openai",
        model,
        content,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
        },
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Google Gemini
    if (targetProvider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment.");

      const model = opts.model || "gemini-1.5-flash";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${defaultSystemPrompt}\n\nTask:\n${prompt}` }],
            },
          ],
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return {
        provider: "gemini",
        model,
        content,
        durationMs: Date.now() - startTime,
      };
    }

    // 5. Sovereign Heuristic Engine (Fallback)
    return executeHeuristicAnalysis(prompt, startTime);
  } catch (err: any) {
    // If external call failed and caller didn't explicitly forbid fallback, return heuristic
    if (targetProvider !== "heuristic") {
      log.warn(`Gateway provider '${targetProvider}' failed (${err.message}). Falling back to sovereign heuristic engine.`);
      return executeHeuristicAnalysis(prompt, startTime, `[Fallback from ${targetProvider}: ${err.message}] `);
    }
    throw err;
  }
}

/**
 * Sovereign heuristic offline analyzer.
 * Formulates precise solutions for CSS layout bugs, handoff trajectories, and architecture reviews.
 */
function executeHeuristicAnalysis(prompt: string, startTime: number, prefix: string = ""): GatewayResponse {
  const lower = prompt.toLowerCase();
  let content = "";

  if (lower.includes("void") || lower.includes("whitespace") || lower.includes("padding")) {
    content = `${prefix}**Kanso Visual Radar Heuristic Analysis (Whitespace Void)**:

1. **Root Cause**: Large static desktop padding (e.g. \`py-32\` or \`my-24\` resulting in > 80px empty space) causes mobile viewports to look hollow or empty.
2. **Recommended Responsive Spacing**:
\`\`\`html
<!-- Replace static py-32 with mobile-first progression -->
<section class="py-12 sm:py-20 lg:py-28 px-4 sm:px-6 max-w-7xl mx-auto">
\`\`\``;
  } else if (
    lower.includes("contrast") ||
    lower.includes("color") ||
    lower.includes("invisible") ||
    lower.includes("legibility") ||
    lower.includes("wcag")
  ) {
    content = `${prefix}**Kanso Visual Radar Heuristic Analysis (Contrast & Legibility)**:

1. **Root Cause**: Foreground text luminance is too close to the background container luminance (WCAG AA ratio < 4.5:1).
2. **Recommended Fix**:
   - For dark surfaces (\`#08080a\` / \`#121216\`): elevate secondary text to at least \`#94a3b8\` (Tailwind \`text-neutral-300\`) or high-contrast \`#f8fafc\` (\`text-white\`).
   - For interactive labels/badges: ensure background opacity is at least \`bg-white/10\` with border \`border-white/15\`.
\`\`\`html
<!-- High-Contrast Badge -->
<span class="px-2.5 py-1 rounded-full text-xs font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-500/30">
  Verified Contrast 6.8:1
</span>
\`\`\``;
  } else if (
    lower.includes("overflow") ||
    lower.includes("scroll") ||
    lower.includes("horizontal") ||
    lower.includes("mobile") ||
    lower.includes("393") ||
    lower.includes("iphone")
  ) {
    content = `${prefix}**Kanso Visual Radar Heuristic Analysis (Mobile Viewport Overflow)**:

1. **Root Cause**: The container or child element defines a fixed min-width, hardcoded pixel width (> 393px), or unconstrained flex row that forces horizontal scroll on mobile viewports.
2. **Recommended Tailwind Patch**:
\`\`\`html
<!-- Before -->
<div class="flex items-center w-[540px]">
  
<!-- After (Responsive) -->
<div class="flex flex-col sm:flex-row items-center w-full max-w-full overflow-hidden">
\`\`\`
3. **Global Safety Guard**: Ensure your root layout has \`overflow-x: hidden\` on mobile:
\`\`\`css
html, body {
  overflow-x: hidden;
  max-width: 100vw;
}
\`\`\``;
  } else if (lower.includes("handoff") || lower.includes("resume")) {
    content = `${prefix}**Kanso Universal Handoff Engine**:

To preserve and transfer your exact workspace trajectory across models (Claude Code ↔ Cursor ↔ Codex ↔ Gemini):
\`\`\`bash
# 1. Capture current git state and patch
kanso handoff "Describe current task and next steps"

# 2. Inspect saved snapshot
kanso handoff status

# 3. In the new agent or model session, run:
kanso handoff resume
\`\`\`
All diffs are safely backed up to \`.kanso/handoff.patch\` and can be restored using \`kanso handoff apply\`.`;
  } else {
    content = `${prefix}**Kanso Sovereign Assistant**:

Received query: "${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}"

Kanso operates locally with sovereign architecture. To activate local LLM models (Llama 3, DeepSeek, Qwen), start Ollama on your machine:
\`\`\`bash
ollama run llama3
\`\`\`
Or provide an API key in your environment (\`ANTHROPIC_API_KEY\`, \`OPENAI_API_KEY\`, or \`GEMINI_API_KEY\`).`;
  }

  return {
    provider: "heuristic",
    model: "kanso-heuristic-v2",
    content,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Generate an automated visual defect repair plan from VibeIssues.
 */
export async function generateVisualRepairPlan(
  issues: VibeIssue[],
  opts: GatewayQueryOptions = {}
): Promise<{ plan: string; patches: Array<{ selector: string; patch: string }> }> {
  if (issues.length === 0) {
    return {
      plan: "Layout is already pristine (VibeScore: 100/100). No repairs necessary.",
      patches: [],
    };
  }

  const prompt = `Analyze these ${issues.length} visual regression defects detected by Kanso VibeTest:
${issues
  .map(
    (iss, idx) =>
      `${idx + 1}. [${iss.severity.toUpperCase()}] ${iss.type} on selector '${iss.elementSelector}' at viewport ${iss.viewport}: ${iss.summary}. Recommendation: ${iss.recommendation}`
  )
  .join("\n")}

Provide a precise CSS/Tailwind self-healing patch for each selector.`;

  const response = await queryGateway(prompt, opts);

  const patches = issues.map((iss) => {
    let patch = iss.recommendation;
    if (iss.type === "viewport_overflow") {
      patch = "max-w-full overflow-hidden flex-wrap";
    } else if (iss.type === "whitespace_void") {
      patch = "py-8 sm:py-16 (reduce mobile padding to prevent >80px void)";
    } else if (iss.type === "invisible_contrast") {
      patch = "text-white bg-neutral-900 border-white/20";
    }
    return {
      selector: iss.elementSelector,
      patch,
    };
  });

  return {
    plan: response.content,
    patches,
  };
}
