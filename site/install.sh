#!/usr/bin/env bash
# Kanso (簡素) Sovereign Installer
# https://kanso.sh
# 100% Free · Local-First · Zero Cloud Dossiers

set -e

# Visual colors
BOLD='\033[1m'
EMERALD='\033[38;2;16;185;129m'
BLUE='\033[38;2;59;130;246m'
DIM='\033[38;2;156;163;175m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}${EMERALD}  簡素  K A N S O${RESET}"
echo -e "${DIM}  Sovereign AI Assistant & Visual Testing Studio${RESET}"
echo -e "${DIM}  ──────────────────────────────────────────────${RESET}"
echo ""

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "❌ ${BOLD}Node.js not detected.${RESET}"
  echo "Kanso requires Node.js (version 18 or newer)."
  echo "Please install Node.js from https://nodejs.org or via brew (brew install node)."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "⚠️  ${BOLD}Node.js version is $NODE_VERSION.${RESET} Kanso recommends Node.js 18+."
fi

# Check for Git
if ! command -v git >/dev/null 2>&1; then
  echo -e "⚠️  ${DIM}Git not found in PATH. Some diff handoff features will be limited.${RESET}"
fi

echo -e "📦 ${BLUE}Installing Kanso globally...${RESET}"
if command -v npm >/dev/null 2>&1; then
  npm install -g kanso
elif command -v pnpm >/dev/null 2>&1; then
  pnpm add -g kanso
elif command -v yarn >/dev/null 2>&1; then
  yarn global add kanso
else
  echo "❌ No supported package manager found (npm, pnpm, yarn)."
  exit 1
fi

echo ""
echo -e "${EMERALD}✓ Kanso installed successfully!${RESET}"
echo ""
echo -e "Run ${BOLD}kanso doctor${RESET} to verify your environment."
echo -e "Run ${BOLD}kanso vibe http://localhost:5173${RESET} to test your visual layout."
echo -e "Run ${BOLD}kanso handoff${RESET} to snapshot agent diffs."
echo ""
