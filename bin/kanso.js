#!/usr/bin/env node

import("../dist/cli/index.js").catch(() => {
  // If dist not built yet, fallback to tsx if available
  import("child_process").then(({ execSync }) => {
    try {
      execSync(`npx tsx ${new URL("../src/cli/index.ts", import.meta.url).pathname} ${process.argv.slice(2).join(" ")}`, {
        stdio: "inherit",
      });
    } catch (e) {
      process.exit(1);
    }
  });
});
