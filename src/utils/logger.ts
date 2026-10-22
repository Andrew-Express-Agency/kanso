/**
 * Kanso Terminal Logger
 * Apple-grade monochrome & subtle accent terminal styling.
 */

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const red = "\x1b[38;2;192;24;30m"; // Crimson
const green = "\x1b[38;2;34;197;94m"; // Emerald
const amber = "\x1b[38;2;245;158;11m"; // Warm amber
const cyan = "\x1b[38;2;6;182;212m"; // Subtle cyan
const gray = "\x1b[38;2;156;163;175m"; // Muted gray

export const log = {
  header: (title: string, subtitle?: string) => {
    console.log(`\n${bold}簡素  ${title}${reset}${subtitle ? `  ${dim}·  ${subtitle}${reset}` : ""}`);
    console.log(`${dim}${"─".repeat(56)}${reset}`);
  },

  info: (msg: string) => {
    console.log(`  ${dim}info${reset}  ${msg}`);
  },

  success: (msg: string) => {
    console.log(`  ${green}✓${reset}     ${msg}`);
  },

  warn: (msg: string) => {
    console.log(`  ${amber}▲${reset}     ${msg}`);
  },

  error: (msg: string) => {
    console.log(`  ${red}✕${reset}     ${msg}`);
  },

  item: (label: string, value: string) => {
    console.log(`  ${dim}${label.padEnd(14)}${reset} ${value}`);
  },

  box: (title: string, lines: string[]) => {
    console.log(`\n  ${bold}┌─ ${title} ${"─".repeat(Math.max(10, 48 - title.length))}┐${reset}`);
    for (const l of lines) {
      console.log(`  ${bold}│${reset}  ${l}`);
    }
    console.log(`  ${bold}└${"─".repeat(52)}┘${reset}\n`);
  },

  divider: () => {
    console.log(`  ${dim}${"─".repeat(52)}${reset}`);
  },
};
