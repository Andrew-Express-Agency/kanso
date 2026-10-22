import http from "http";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const PORT = 4190;
const SITE_DIR = path.resolve("./site");

const server = http.createServer((req, res) => {
  let reqPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(SITE_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".json": "application/json",
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, async () => {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({
    path: "/Users/simongarcia/.gemini/antigravity-cli/brain/bbd34231-954c-44a8-9dac-38dec561b7ea/kanso_photo_mobile_393.png",
    clip: { x: 0, y: 0, width: 393, height: 1200 }
  });
  console.log("Captured Mobile 393px screenshot");

  await browser.close();
  server.close();
});
