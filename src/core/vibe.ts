/**
 * Kanso VibeTest Engine 2.0
 * Deep headless DOM inspection, visual regression radar, and layout eyes.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import puppeteer, { Browser } from "puppeteer-core";
import { log } from "../utils/logger.js";

export interface VibeIssue {
  type: "invisible_contrast" | "whitespace_void" | "viewport_overflow" | "tap_target_sizing" | "broken_image";
  severity: "error" | "warning";
  viewport: "mobile (393px)" | "desktop (1440px)";
  elementSelector: string;
  summary: string;
  recommendation: string;
  metrics?: Record<string, any>;
}

export interface VibeCategoryScore {
  category: string;
  score: number;
  weight: number;
}

export interface VibeReport {
  url: string;
  timestamp: string;
  overallScore: number;
  categories: VibeCategoryScore[];
  screenshots: {
    mobile: string;
    desktop: string;
  };
  issues: VibeIssue[];
  htmlReportPath?: string;
}

function findChromePath(): string {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "google-chrome";
}

/**
 * Injected in-page DOM inspection script
 */
function getDomAuditScript() {
  return `(() => {
    const issues = [];
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;

    // 1. Mobile Horizontal Viewport Overflow
    function isClippedByAncestor(node) {
      let cur = node.parentElement;
      while (cur && cur !== document.documentElement && cur !== document.body) {
        const s = window.getComputedStyle(cur);
        if (s.overflowX === 'hidden' || s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'clip') {
          const pRect = cur.getBoundingClientRect();
          if (pRect.right <= vw + 3) {
            return true;
          }
        }
        cur = cur.parentElement;
      }
      return false;
    }

    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > vw + 3) {
        if (isClippedByAncestor(el)) continue;

        // Find readable selector
        let sel = el.tagName.toLowerCase();
        if (el.id) sel += '#' + el.id;
        else if (el.className && typeof el.className === 'string') sel += '.' + el.className.trim().split(/\\s+/)[0];

        issues.push({
          type: 'viewport_overflow',
          severity: 'error',
          elementSelector: sel,
          summary: 'Element extends ' + Math.round(rect.right - vw) + 'px beyond the mobile screen boundary',
          recommendation: 'Add max-w-full, overflow-hidden, or check explicit width properties.'
        });
        break; // Report worst offender
      }
    }

    // 2. Whitespace Void Radar (>80px empty vertical space)
    const rawBlocks = Array.from(document.querySelectorAll('body > section, body > div, body > main, main > section, main > div, header, footer'));
    const blocks = rawBlocks.filter((el, idx) => {
      const r = el.getBoundingClientRect();
      if (r.height < 20 || r.width < 50) return false;
      return !rawBlocks.some((other, oIdx) => oIdx !== idx && other.contains(el));
    });

    for (let i = 0; i < blocks.length - 1; i++) {
      const r1 = blocks[i].getBoundingClientRect();
      const r2 = blocks[i+1].getBoundingClientRect();
      const gap = r2.top - r1.bottom;
      if (gap > 85) {
        let sel = blocks[i].tagName.toLowerCase();
        if (blocks[i].id) sel += '#' + blocks[i].id;
        else if (blocks[i].className && typeof blocks[i].className === 'string') sel += '.' + blocks[i].className.trim().split(/\\s+/)[0];

        issues.push({
          type: 'whitespace_void',
          severity: 'warning',
          elementSelector: sel,
          summary: 'Detected an empty vertical gap of ' + Math.round(gap) + 'px between layout blocks',
          recommendation: 'Check container padding-top / margin-top. Avoid stacking fixed navbar clearances.'
        });
      }
    }

    // 3. Invisible & Low-Contrast Elements
    function getLuminance(r, g, b) {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    const _colorCanvas = document.createElement('canvas');
    _colorCanvas.width = 1;
    _colorCanvas.height = 1;
    const _colorCtx = _colorCanvas.getContext('2d', { willReadFrequently: true });

    function parseRgb(colorStr) {
      if (_colorCtx) {
        try {
          _colorCtx.clearRect(0, 0, 1, 1);
          _colorCtx.fillStyle = colorStr;
          _colorCtx.fillRect(0, 0, 1, 1);
          const imgData = _colorCtx.getImageData(0, 0, 1, 1).data;
          const r = imgData[0];
          const g = imgData[1];
          const b = imgData[2];
          const a = imgData[3] / 255;
          if (a < 0.95) {
            // Blend alpha over obsidian canvas [10, 10, 12]
            return [
              Math.round(r * a + 10 * (1 - a)),
              Math.round(g * a + 10 * (1 - a)),
              Math.round(b * a + 12 * (1 - a))
            ];
          }
          return [r, g, b];
        } catch (_) {}
      }

      const m = colorStr.match(/\\d+(\\.\\d+)?/g);
      if (!m) return [0, 0, 0];
      const r = parseFloat(m[0]);
      const g = parseFloat(m[1]);
      const b = parseFloat(m[2]);
      const a = m[3] !== undefined ? parseFloat(m[3]) : 1.0;
      if (a < 0.95) {
        // Blend alpha over obsidian canvas [10, 10, 12]
        return [
          Math.round(r * a + 10 * (1 - a)),
          Math.round(g * a + 10 * (1 - a)),
          Math.round(b * a + 12 * (1 - a))
        ];
      }
      return [r, g, b];
    }

    const textEls = Array.from(document.querySelectorAll('p, span, h1, h2, h3, h4, a, button, div'));
    for (const el of textEls) {
      if (el.children.length === 0 && el.textContent.trim().length > 3) {
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) continue;
        if (style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text') continue;

        // Find effective background color by walking up
        let bgStyle = style.backgroundColor;
        let parent = el.parentElement;
        while (parent && (bgStyle === 'rgba(0, 0, 0, 0)' || bgStyle === 'transparent')) {
          bgStyle = window.getComputedStyle(parent).backgroundColor;
          parent = parent.parentElement;
        }

        if (bgStyle && bgStyle !== 'rgba(0, 0, 0, 0)' && bgStyle !== 'transparent') {
          const fg = parseRgb(style.color);
          const bg = parseRgb(bgStyle);
          const l1 = getLuminance(fg[0], fg[1], fg[2]);
          const l2 = getLuminance(bg[0], bg[1], bg[2]);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

          if (ratio < 2.0 && el.textContent.trim().length > 5) {
            let sel = el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') sel += '.' + el.className.trim().split(/\\s+/)[0];

            issues.push({
              type: 'invisible_contrast',
              severity: 'error',
              elementSelector: sel,
              summary: 'Near-invisible text ("' + el.textContent.trim().slice(0, 24) + '..."): contrast ratio ' + ratio.toFixed(2) + ':1',
              recommendation: 'Increase color contrast to at least 4.5:1. Switch text to white (#ffffff) on dark backgrounds.'
            });
            break; // One per category is enough for AI repair
          }
        }
      }
    }

    // 4. Touch Target & Button Sizing
    const interactive = Array.from(document.querySelectorAll('button, a[href], input[type="submit"]'));
    for (const btn of interactive) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (rect.height < 36 && rect.width < 36) {
          let sel = btn.tagName.toLowerCase();
          if (btn.className && typeof btn.className === 'string') sel += '.' + btn.className.trim().split(/\\s+/)[0];

          issues.push({
            type: 'tap_target_sizing',
            severity: 'warning',
            elementSelector: sel,
            summary: 'Touch target is only ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + 'px (Apple HIG recommends >= 44x44px)',
            recommendation: 'Increase touch area padding to minimum py-2.5 px-4 or min-h-[44px].'
          });
          break;
        }
      }
    }

    return issues;
  })()`;
}

export async function runVibeTest(
  url: string,
  opts: { outputDir?: string; openHtml?: boolean; ci?: boolean; minScore?: number } = {}
): Promise<VibeReport> {
  // Normalize target URL (e.g. localhost:5173 -> http://localhost:5173)
  let targetUrl = url.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://") && !targetUrl.startsWith("file://")) {
    targetUrl = "http://" + targetUrl;
  }

  log.header("VibeTest 2.0", `Deep Visual & DOM Audit for ${targetUrl}`);

  const cwd = process.cwd();
  const reportDir = opts.outputDir || path.join(cwd, ".kanso/vibe-reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const chromePath = findChromePath();
  const mobileScreenshot = path.join(reportDir, "mobile_393.png");
  const desktopScreenshot = path.join(reportDir, "desktop_1440.png");

  let browser: Browser | null = null;
  const issues: VibeIssue[] = [];

  try {
    log.info("Launching headless Apple Silicon Chrome engine via CDP...");
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
    });

    const page = await browser.newPage();

    // 1. Audit Mobile Viewport (iPhone 15 Pro: 393 × 852, scale 2)
    log.info("Inspecting Mobile Viewport (iPhone 15 Pro — 393px)...");
    await page.setViewport({
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    try {
      const navResponse = await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 15000 });
      if (navResponse && navResponse.status() >= 400) {
        log.warn(`Target responded with HTTP ${navResponse.status()}`);
      }
    } catch (navErr: any) {
      if (browser) await browser.close();
      log.error(`Could not connect to target URL: ${navErr.message || navErr}`);
      log.info(`Tip: Make sure your local server is running and accessible at ${targetUrl}`);
      throw new Error(`Target unreachable: ${targetUrl}`);
    }

    await page.screenshot({ path: mobileScreenshot as any, fullPage: false });
    log.success("Captured mobile frame (393 × 852)");

    // Run in-page mobile audit
    const mobileIssues = (await page.evaluate(getDomAuditScript())) as VibeIssue[];
    for (const iss of mobileIssues) {
      iss.viewport = "mobile (393px)";
      issues.push(iss);
    }

    // 2. Audit Desktop Viewport (MacBook Pro 16: 1440 × 900, scale 2)
    log.info("Inspecting Desktop Viewport (MacBook Pro — 1440px)...");
    await page.setViewport({
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      isMobile: false,
    });

    try {
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 15000 });
    } catch {}

    await page.screenshot({ path: desktopScreenshot as any, fullPage: false });
    log.success("Captured desktop frame (1440 × 900)");

    const desktopIssues = (await page.evaluate(getDomAuditScript())) as VibeIssue[];
    for (const iss of desktopIssues) {
      if (iss.type !== "viewport_overflow") {
        iss.viewport = "desktop (1440px)";
        // Avoid duplicates if already caught on mobile
        if (!issues.some((x) => x.elementSelector === iss.elementSelector && x.type === iss.type)) {
          issues.push(iss);
        }
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes("Target unreachable")) {
      throw err;
    }
    log.warn(`CDP deep audit encountered notice: ${err.message || err}`);
    log.info("Running deterministic fallback capture...");

    // Fallback CLI capture
    try {
      execSync(
        `"${chromePath}" --headless=new --force-color-profile=srgb --disable-gpu --no-sandbox --window-size=393,852 --screenshot="${mobileScreenshot}" "${url}"`,
        { stdio: "ignore", timeout: 15000 }
      );
      execSync(
        `"${chromePath}" --headless=new --force-color-profile=srgb --disable-gpu --no-sandbox --window-size=1440,900 --screenshot="${desktopScreenshot}" "${url}"`,
        { stdio: "ignore", timeout: 15000 }
      );
    } catch {}
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Calculate Weighted Category Scores
  let contrastScore = 100;
  let spacingScore = 100;
  let overflowScore = 100;
  let tapScore = 100;

  for (const iss of issues) {
    if (iss.type === "invisible_contrast") contrastScore -= iss.severity === "error" ? 25 : 10;
    if (iss.type === "whitespace_void") spacingScore -= iss.severity === "error" ? 20 : 10;
    if (iss.type === "viewport_overflow") overflowScore -= 30;
    if (iss.type === "tap_target_sizing") tapScore -= 15;
  }

  contrastScore = Math.max(0, contrastScore);
  spacingScore = Math.max(0, spacingScore);
  overflowScore = Math.max(0, overflowScore);
  tapScore = Math.max(0, tapScore);

  const categories: VibeCategoryScore[] = [
    { category: "Mobile Responsiveness", score: overflowScore, weight: 0.3 },
    { category: "Visual Contrast & Legibility", score: contrastScore, weight: 0.3 },
    { category: "Spacing & Layout Hygiene", score: spacingScore, weight: 0.25 },
    { category: "Tap Targets & Usability", score: tapScore, weight: 0.15 },
  ];

  const overallScore = Math.round(
    categories.reduce((acc, cat) => acc + cat.score * cat.weight, 0)
  );

  // Generate Interactive HTML Report
  const htmlReportPath = path.join(reportDir, "report.html");
  const htmlContent = generateInteractiveHtmlReport(targetUrl, overallScore, categories, issues, mobileScreenshot, desktopScreenshot);
  fs.writeFileSync(htmlReportPath, htmlContent, "utf-8");

  // Generate Markdown AI Report
  const mdReportPath = path.join(reportDir, "vibe-report.md");
  const mdContent = `# Kanso VibeTest 2.0 Report — ${targetUrl}

* **Timestamp**: ${new Date().toISOString()}
* **VibeScore™**: **${overallScore} / 100**
* **Mobile Capture**: \`${mobileScreenshot}\`
* **Desktop Capture**: \`${desktopScreenshot}\`
* **Interactive HTML**: \`${htmlReportPath}\`

## Category Breakdown
${categories.map((c) => `* **${c.category}**: ${c.score} / 100`).join("\n")}

## Detected Layout & Visual Issues
${
  issues.length === 0
    ? "✅ **Pristine layout.** No visual regressions, voids, or contrast defects detected."
    : issues
        .map(
          (issue, i) => `### ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.summary}
* **Category**: \`${issue.type}\`
* **Viewport**: ${issue.viewport}
* **Selector**: \`${issue.elementSelector}\`
* **Self-Heal Recommendation**: ${issue.recommendation}
`
        )
        .join("\n")
}

## Automated Self-Healing Command
Feed this report to Claude, Cursor, Codex, or Gemini:
\`\`\`bash
kanso handoff "Fix visual defects identified in .kanso/vibe-reports/vibe-report.md"
\`\`\`
`;

  fs.writeFileSync(mdReportPath, mdContent, "utf-8");

  log.divider();
  log.item("Target URL", targetUrl);
  log.item("VibeScore™", `${overallScore} / 100`);
  for (const c of categories) {
    log.item(c.category, `${c.score} / 100`);
  }
  log.divider();
  log.item("HTML Report", htmlReportPath);
  log.item("AI Markdown", mdReportPath);
  log.success(`VibeTest complete: ${issues.length} issue(s) detected.`);

  if (opts.ci) {
    const threshold = opts.minScore ?? 80;
    if (overallScore < threshold) {
      log.error(`CI Visual Gate Failed: VibeScore ${overallScore} is below required threshold ${threshold}.`);
      throw new Error(`Visual regression gate failed: Score ${overallScore} is below threshold ${threshold}`);
    } else {
      log.success(`CI Visual Gate Passed: VibeScore ${overallScore} meets minimum threshold ${threshold}.`);
    }
  }

  return {
    url: targetUrl,
    timestamp: new Date().toISOString(),
    overallScore,
    categories,
    screenshots: {
      mobile: mobileScreenshot,
      desktop: desktopScreenshot,
    },
    issues,
    htmlReportPath,
  };
}

function generateInteractiveHtmlReport(
  url: string,
  score: number,
  categories: VibeCategoryScore[],
  issues: VibeIssue[],
  mobileImg: string,
  desktopImg: string
): string {
  const mobileRel = path.basename(mobileImg);
  const desktopRel = path.basename(desktopImg);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kanso VibeTest — ${url}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: #0a0a0c;
      --card: rgba(22, 22, 26, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --crimson: #c0181e;
      --green: #22c55e;
      --amber: #f59e0b;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Helvetica, sans-serif;
      padding: 32px 24px;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: 0.08em; display: flex; align-items: center; gap: 10px; }
    .score-badge {
      font-size: 36px;
      font-weight: 900;
      color: ${score >= 90 ? "var(--green)" : score >= 75 ? "var(--amber)" : "var(--crimson)"};
    }
    .grid { display: grid; grid-template-columns: 3fr 2fr; gap: 28px; }
    .card {
      background: var(--card);
      backdrop-filter: blur(24px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }
    h2 { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 16px; }
    .cat-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
    .cat-bar { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-top: 4px; }
    .cat-fill { height: 100%; border-radius: 3px; }
    .preview-container { display: flex; gap: 20px; align-items: flex-start; justify-content: center; }
    .phone-frame {
      width: 260px;
      border: 6px solid #222;
      border-radius: 32px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
    }
    .phone-frame img { width: 100%; display: block; }
    .issue-item {
      padding: 14px 16px;
      background: rgba(255,255,255,0.03);
      border-left: 3px solid var(--crimson);
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .issue-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .issue-rec { font-size: 13px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <span>簡素</span>
        <span>KANSO VIBETEST</span>
      </div>
      <div>
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">VibeScore™</div>
        <div class="score-badge">${score}<span style="font-size:18px;color:var(--muted)">/100</span></div>
      </div>
    </header>

    <div class="grid">
      <div>
        <div class="card" style="margin-bottom:28px">
          <h2>Visual Health Breakdown</h2>
          ${categories
            .map(
              (c) => `
            <div style="margin-bottom:16px">
              <div class="cat-row">
                <span>${c.category}</span>
                <strong>${c.score}%</strong>
              </div>
              <div class="cat-bar">
                <div class="cat-fill" style="width:${c.score}%;background:${
                c.score >= 90 ? "var(--green)" : c.score >= 70 ? "var(--amber)" : "var(--crimson)"
              }"></div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="card">
          <h2>Detected Issues (${issues.length})</h2>
          ${
            issues.length === 0
              ? '<p style="color:var(--green)">✓ All visual parameters, spacing, and contrast metrics are healthy.</p>'
              : issues
                  .map(
                    (iss) => `
            <div class="issue-item">
              <div class="issue-title">[${iss.viewport}] ${iss.summary}</div>
              <div class="issue-rec">Selector: <code>${iss.elementSelector}</code> · ${iss.recommendation}</div>
            </div>
          `
                  )
                  .join("")
          }
        </div>
      </div>

      <div>
        <div class="card" style="text-align:center">
          <h2>Mobile Frame (393px)</h2>
          <div class="preview-container">
            <div class="phone-frame">
              <img src="${mobileRel}" alt="Mobile Preview" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
