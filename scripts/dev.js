#!/usr/bin/env node
// Local preview with the API working: serves the static sites and runs the
// functions in api/ the way Vercel does. No dependencies.
//
//   node scripts/dev.js            then open http://localhost:8000/halecat/
//
// Set HALECAT_ICAL_URLS, RESEND_API_KEY and HALECAT_BOOKINGS_TO in the shell
// to test against a real diary and inbox.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function withHelpers(res) {
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  return res;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const api = /^\/api\/([a-z-]+)$/.exec(url.pathname);
    if (api) {
      const file = path.join(ROOT, "api", `${api[1]}.js`);
      if (!fs.existsSync(file)) return withHelpers(res).status(404).json({ error: "Not found" });
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        try {
          req.body = raw && /json/.test(req.headers["content-type"] || "") ? JSON.parse(raw) : raw;
        } catch {
          req.body = raw;
        }
        try {
          await require(file)(req, withHelpers(res));
        } catch (err) {
          console.error(err);
          withHelpers(res).status(500).json({ error: "Server error" });
        }
      });
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/estate/" });
      return res.end();
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("Not found");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Estate sites on http://localhost:${PORT}/estate/`));
