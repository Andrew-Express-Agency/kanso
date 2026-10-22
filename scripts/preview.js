import http from "http";
import fs from "fs";
import path from "path";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4173;
const SITE_DIR = new URL("../site", import.meta.url).pathname;

const server = http.createServer((req, res) => {
  let reqPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(SITE_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
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

server.listen(PORT, () => {
  console.log(`\n  簡素  Kanso Landing Page Preview`);
  console.log(`  ──────────────────────────────────────────`);
  console.log(`  Local URL:   http://localhost:${PORT}`);
  console.log(`  Source Dir:  ${SITE_DIR}`);
  console.log(`  Deployment:  Ready for Cloudflare Pages (folder: "site")\n`);
});
