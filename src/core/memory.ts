/**
 * Kanso Local Episodic Memory 2.0
 * Sovereign, 100% offline episodic memory for AI engineering insights and preferences.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../utils/logger.js";

export interface MemoryEntry {
  id: string;
  timestamp: string;
  project?: string;
  topic: string;
  tags: string[];
  insight: string;
  solution?: string;
}

export interface RecallResult {
  entry: MemoryEntry;
  score: number;
}

function getMemoryFilePath(): string {
  const homeDir = os.homedir();
  const kansoDir = path.join(homeDir, ".kanso");
  if (!fs.existsSync(kansoDir)) {
    fs.mkdirSync(kansoDir, { recursive: true });
  }
  return path.join(kansoDir, "memory.json");
}

export function loadMemories(): MemoryEntry[] {
  const file = getMemoryFilePath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

export function saveMemories(entries: MemoryEntry[]) {
  const file = getMemoryFilePath();
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), "utf-8");
}

export function remember(entry: {
  topic: string;
  insight: string;
  solution?: string;
  tags?: string[];
  project?: string;
}): MemoryEntry {
  log.header("Memory 2.0", "Storing sovereign episodic insight");

  const memories = loadMemories();
  const newEntry: MemoryEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    project: entry.project || path.basename(process.cwd()),
    topic: entry.topic.trim(),
    tags: entry.tags || [],
    insight: entry.insight.trim(),
    solution: entry.solution ? entry.solution.trim() : undefined,
  };

  memories.unshift(newEntry);
  saveMemories(memories);

  log.success(`Remembered: "${newEntry.topic}"`);
  if (newEntry.project) log.item("Project", newEntry.project);
  log.item("Tags", newEntry.tags.length > 0 ? newEntry.tags.join(", ") : "none");
  log.item("Insight", newEntry.insight);
  if (newEntry.solution) {
    log.item("Solution", newEntry.solution);
  }

  return newEntry;
}

/**
 * Smart relevance ranking for memories
 */
export function recall(query: string, opts?: { project?: string; limit?: number }): MemoryEntry[] {
  log.header("Memory Recall 2.0", `Query: "${query}"${opts?.project ? ` [Project: ${opts.project}]` : ""}`);

  const memories = loadMemories();
  if (memories.length === 0) {
    log.info("Episodic memory store is empty (~/.kanso/memory.json).");
    return [];
  }

  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);

  const scored: RecallResult[] = [];

  for (const m of memories) {
    // Project filter if specified
    if (opts?.project && m.project && m.project.toLowerCase() !== opts.project.toLowerCase()) {
      continue;
    }

    let score = 0;
    const topicLower = m.topic.toLowerCase();
    const insightLower = m.insight.toLowerCase();
    const solutionLower = (m.solution || "").toLowerCase();
    const tagsLower = m.tags.map((t) => t.toLowerCase()).join(" ");

    // Exact query matching
    if (topicLower.includes(q)) score += 20;
    if (solutionLower.includes(q)) score += 15;
    if (insightLower.includes(q)) score += 10;
    if (tagsLower.includes(q)) score += 12;

    // Token-level matching
    for (const token of tokens) {
      if (topicLower.includes(token)) score += 5;
      if (tagsLower.includes(token)) score += 4;
      if (solutionLower.includes(token)) score += 3;
      if (insightLower.includes(token)) score += 2;
    }

    if (score > 0) {
      scored.push({ entry: m, score });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const limit = opts?.limit || 5;
  const results = scored.slice(0, limit).map((s) => s.entry);

  if (results.length === 0) {
    log.info(`No previous memories matched query "${query}".`);
    return [];
  }

  log.success(`Found ${results.length} relevant memory entry(ies):`);
  for (const m of results) {
    console.log(`\n  📌 [${m.project || "general"}] ${m.topic}`);
    console.log(`     Recorded: ${new Date(m.timestamp).toLocaleDateString()} · ID: ${m.id}`);
    if (m.tags.length > 0) console.log(`     Tags:     ${m.tags.join(", ")}`);
    console.log(`     Insight:  ${m.insight}`);
    if (m.solution) {
      console.log(`     Solution: ${m.solution}`);
    }
  }

  return results;
}

export function listMemories(opts?: { project?: string; limit?: number }): MemoryEntry[] {
  log.header("Memory Archive", "Browsing local episodic knowledge");

  const memories = loadMemories();
  let filtered = memories;
  if (opts?.project) {
    filtered = memories.filter((m) => m.project && m.project.toLowerCase() === opts.project!.toLowerCase());
  }

  const limit = opts?.limit || 10;
  const display = filtered.slice(0, limit);

  log.item("Total Stored", `${memories.length} entries`);
  if (opts?.project) log.item("Filtered Project", opts.project);

  for (const m of display) {
    console.log(`\n  • [${m.project || "general"}] ${m.topic} (${new Date(m.timestamp).toLocaleDateString()})`);
    console.log(`    Insight:  ${m.insight}`);
    if (m.solution) console.log(`    Solution: ${m.solution}`);
  }

  return display;
}

export function deleteMemory(id: string): boolean {
  const memories = loadMemories();
  const initialLen = memories.length;
  const filtered = memories.filter((m) => m.id !== id);

  if (filtered.length === initialLen) {
    log.warn(`Memory with ID "${id}" was not found.`);
    return false;
  }

  saveMemories(filtered);
  log.success(`Deleted memory entry "${id}".`);
  return true;
}
