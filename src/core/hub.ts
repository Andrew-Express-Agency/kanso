/**
 * Kanso Hub Engine
 * The open-source registry for agent memory packs, visual rules, and developer heuristics.
 * "The Hugging Face of AI Agent Memory & Visual Intelligence."
 */

import fs from "fs";
import path from "path";
import { remember, MemoryEntry, loadMemories } from "./memory.js";
import { log } from "../utils/logger.js";

export interface HubPack {
  id: string;
  name: string;
  category: "memory" | "rules";
  description: string;
  author: string;
  entries: Array<{
    topic: string;
    tags: string[];
    insight: string;
    solution: string;
  }>;
}

export const OFFICIAL_PACKS: Record<string, HubPack> = {
  "memory/tailwind-gotchas": {
    id: "memory/tailwind-gotchas",
    name: "Tailwind CSS Layout & Mobile Radar Pack",
    category: "memory",
    description: "Curated layout gotchas: mobile horizontal leaks, 80px navbar voids, and contrast traps.",
    author: "Kanso Core Team",
    entries: [
      {
        topic: "Mobile Fixed Navbar Whitespace Void",
        tags: ["tailwind", "navbar", "void", "mobile"],
        insight: "Combining fixed navbar with static pt-24 causes a 96px empty dead zone on mobile viewports under 400px.",
        solution: "Use pt-16 sm:pt-24 and apply safe-area-inset padding for iOS devices.",
      },
      {
        topic: "Flex Child Horizontal Viewport Leak",
        tags: ["tailwind", "flexbox", "overflow", "mobile"],
        insight: "Flex children default to min-width: auto, causing long strings or code blocks to push the 393px mobile boundary.",
        solution: "Add 'min-w-0' to all flex children containing text or dynamic cards.",
      },
      {
        topic: "Dark Obsidian Glass Contrast Trap",
        tags: ["tailwind", "contrast", "glassmorphism", "accessibility"],
        insight: "Using text-neutral-400 or text-neutral-500 over rgba(255,255,255,0.05) glass cards yields a failing contrast ratio under 3:1.",
        solution: "Elevate primary body text to text-neutral-200 or text-white (#f3f4f6), and reserve neutral-400 strictly for secondary micro-labels.",
      },
    ],
  },

  "memory/nextjs-gotchas": {
    id: "memory/nextjs-gotchas",
    name: "Next.js App Router Architecture Pack",
    category: "memory",
    description: "Crucial App Router rules: server actions, dynamic caching, and hydration mismatch prevention.",
    author: "Kanso Core Team",
    entries: [
      {
        topic: "Route Handler Cache Traps",
        tags: ["nextjs", "api", "caching", "headers"],
        insight: "GET route handlers without dynamic headers are aggressively cached statically by default in production builds.",
        solution: "Export const dynamic = 'force-dynamic' or use cookies() / headers() to ensure fresh execution.",
      },
      {
        topic: "Hydration Mismatch on Date & Local Time",
        tags: ["nextjs", "hydration", "react", "ssr"],
        insight: "Rendering new Date().toLocaleDateString() directly in server-rendered JSX causes React hydration mismatch errors.",
        solution: "Render timestamps inside a useEffect hook or use suppressHydrationWarning on the wrapper element.",
      },
    ],
  },

  "memory/ios-safari": {
    id: "memory/ios-safari",
    name: "iOS Safari & Mobile Web Physics Pack",
    category: "memory",
    description: "Fix 100vh address bar jumps, touch targets, and elastic overscroll bugs.",
    author: "Kanso Core Team",
    entries: [
      {
        topic: "Mobile Safari 100vh Address Bar Jump",
        tags: ["safari", "ios", "viewport", "mobile"],
        insight: "100vh includes the hidden area behind the Safari address bar, causing button clips and layout jumps when scrolling.",
        solution: "Use 'h-dvh' (dynamic viewport height) or 'min-h-[100dvh]' for full-screen hero containers.",
      },
      {
        topic: "Apple Human Interface Tap Target Sizing",
        tags: ["apple", "touch", "accessibility", "ios"],
        insight: "Tap targets smaller than 44x44px fail Apple HIG guidelines and cause high mis-click bounce rates on mobile.",
        solution: "Ensure clickable anchors and buttons have min-w-[44px] min-h-[44px] or padded click boundaries.",
      },
      {
        topic: "Modal Elastic Overscroll Body Lock",
        tags: ["ios", "modal", "overscroll", "touch"],
        insight: "Opening a modal on iOS allows the background body to rubber-band scroll underneath.",
        solution: "Apply 'overscroll-behavior: contain' and position: fixed with top offset to the root body during modal open.",
      },
    ],
  },

  "memory/nvidia-nim": {
    id: "memory/nvidia-nim",
    name: "NVIDIA RTX AI & NIM Microservices Pack",
    category: "memory",
    description: "Accelerate local agent inference on NVIDIA RTX GPUs, TensorRT-LLM, and local NIM containers.",
    author: "Kanso Core Team",
    entries: [
      {
        topic: "Local NVIDIA NIM Container Endpoint",
        tags: ["nvidia", "nim", "tensorrt", "gpu", "local-ai"],
        insight: "NVIDIA NIM exposes an OpenAI-compatible /v1/chat/completions endpoint on localhost:8000 with sub-10ms time-to-first-token.",
        solution: "Point agent SDKs to http://localhost:8000/v1 with model 'meta/llama3-70b-instruct' and max_tokens: 4096.",
      },
      {
        topic: "CUDA Unified Memory Allocation with Headless Chrome",
        tags: ["nvidia", "cuda", "vram", "chrome", "gpu"],
        insight: "Simultaneously running headless Chrome rendering and 70B local LLMs on a single RTX GPU can trigger CUDA out-of-memory errors.",
        solution: "Launch Chrome with --disable-gpu flag to reserve 100% of dedicated VRAM for TensorRT-LLM execution.",
      },
    ],
  },
};

export function listHubPacks(): HubPack[] {
  log.header("Kanso Hub", "Open-Source Registry for Agent Memory & Visual Rules");
  const packs = Object.values(OFFICIAL_PACKS);

  console.log(`\n  Official Curated Packs (${packs.length} available):\n`);
  for (const p of packs) {
    console.log(`  📦 ${p.id}`);
    console.log(`     ${p.name} · by ${p.author}`);
    console.log(`     ${p.description}`);
    console.log(`     Entries: ${p.entries.length} items`);
    console.log(`     Install: kanso pull ${p.id}\n`);
  }

  return packs;
}

export function pullHubPack(packId: string): boolean {
  log.header("Kanso Hub Pull", `Installing "${packId}"`);

  const pack = OFFICIAL_PACKS[packId];
  if (!pack) {
    log.error(`Pack "${packId}" was not found in Kanso Hub.`);
    log.info(`Available packs: ${Object.keys(OFFICIAL_PACKS).join(", ")}`);
    return false;
  }

  let installedCount = 0;
  for (const entry of pack.entries) {
    remember({
      topic: entry.topic,
      insight: entry.insight,
      solution: entry.solution,
      tags: entry.tags,
      project: "hub-pack",
    });
    installedCount++;
  }

  log.success(`Successfully pulled "${pack.name}"!`);
  log.item("Installed Entries", `${installedCount} heuristics added to ~/.kanso/memory.json`);
  log.item("Offline Recall", `Try running: kanso recall "${pack.entries[0].tags[0]}"`);

  return true;
}
