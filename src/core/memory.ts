/**
 * Kanso Local Episodic Memory
 * Sovereign, 100% offline memory for personal preferences and engineering insights.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../utils/logger.js";

export interface MemoryEntry {
  id: string;
  timestamp: string;
  topic: string;
  tags: string[];
  insight: string;
  solution?: string;
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

export function remember(entry: Omit<MemoryEntry, "id" | "timestamp">): MemoryEntry {
  log.header("Memory", "Storing episodic insight");

  const memories = loadMemories();
  const newEntry: MemoryEntry = {
    ...entry,
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  memories.unshift(newEntry);
  saveMemories(memories);

  log.success(`Remembered: "${newEntry.topic}"`);
  log.item("Tags", newEntry.tags.join(", ") || "none");
  log.item("Insight", newEntry.insight);
  if (newEntry.solution) {
    log.item("Solution", newEntry.solution);
  }

  return newEntry;
}

export function recall(query: string): MemoryEntry[] {
  log.header("Memory Recall", `Query: "${query}"`);

  const memories = loadMemories();
  const q = query.toLowerCase();

  const matches = memories.filter((m) => {
    return (
      m.topic.toLowerCase().includes(q) ||
      m.insight.toLowerCase().includes(q) ||
      (m.solution && m.solution.toLowerCase().includes(q)) ||
      m.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (matches.length === 0) {
    log.info(`No previous memories matched "${query}".`);
    return [];
  }

  log.success(`Found ${matches.length} relevant memory entry(ies):`);
  for (const m of matches) {
    console.log(`\n  ${m.topic} (${new Date(m.timestamp).toLocaleDateString()})`);
    console.log(`  Insight:  ${m.insight}`);
    if (m.solution) console.log(`  Solution: ${m.solution}`);
  }

  return matches;
}
