const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const WEB_DIR = path.join(__dirname, "..", "web");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

// Static UI + a WebSocket for live frames and settings. Emits: command(msg, reply).
function startWeb({ port, host, onCommand, onConnect }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.normalize(path.join(WEB_DIR, rel));
    if (!file.startsWith(WEB_DIR)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("Not found");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    const reply = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
    ws.on("message", (raw) => {
      try {
        onCommand(JSON.parse(raw), reply);
      } catch {
        /* ignore malformed command */
      }
    });
    onConnect(reply);
  });

  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === 1) c.send(data);
  };

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve({ broadcast, close: () => server.close() }));
  });
}

module.exports = { startWeb };
