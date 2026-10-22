import { startStudioServer } from "../src/core/studio.js";
import puppeteer from "puppeteer-core";
import fs from "fs";

async function snapStudio() {
  const port = 3105;
  const target = "https://kanso-studio-byz.pages.dev";
  const server = startStudioServer(target, { port, open: false, app: false });

  await new Promise(r => setTimeout(r, 800));

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle0" });

  // Wait a moment for icons and styling
  await new Promise(r => setTimeout(r, 1200));

  const outPath = "/Users/simongarcia/.gemini/antigravity-cli/brain/bbd34231-954c-44a8-9dac-38dec561b7ea/kanso_studio_phase2_canvas.png";
  await page.screenshot({ path: outPath });

  console.log("Captured Studio Canvas screenshot to " + outPath);

  // Now toggle Defect Drawer and capture
  await page.evaluate(() => {
    (window as any).toggleDefectsDrawer();
  });
  await new Promise(r => setTimeout(r, 600));
  const defectSnapPath = "/Users/simongarcia/.gemini/antigravity-cli/brain/bbd34231-954c-44a8-9dac-38dec561b7ea/kanso_studio_phase2_defects.png";
  await page.screenshot({ path: defectSnapPath });
  console.log("Captured Studio Defects Drawer screenshot to " + defectSnapPath);

  // Now toggle Gateway Drawer and capture
  await page.evaluate(() => {
    (window as any).toggleGatewayDrawer();
  });
  await new Promise(r => setTimeout(r, 600));
  const gatewaySnapPath = "/Users/simongarcia/.gemini/antigravity-cli/brain/bbd34231-954c-44a8-9dac-38dec561b7ea/kanso_studio_phase2_gateway.png";
  await page.screenshot({ path: gatewaySnapPath });
  console.log("Captured Studio Gateway Drawer screenshot to " + gatewaySnapPath);

  await browser.close();
  server.close();
}

snapStudio().catch(console.error);
