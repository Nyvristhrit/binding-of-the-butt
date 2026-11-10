const net = require("net");
const { EventEmitter } = require("events");

const WATCHDOG_MS = 3000;

// Splits a TCP byte stream into JSON lines; keeps partial lines across chunks.
class LineReader {
  constructor(onMessage) {
    this.buf = "";
    this.onMessage = onMessage;
  }
  push(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        /* ignore malformed line */
      }
    }
    if (this.buf.length > 64 * 1024) this.buf = "";
  }
}

// TCP server the Isaac mod connects to. Emits: connected, disconnected, message, alive(bool).
class GameLink extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.socket = null;
    this.lastSeen = 0;
    this.alive = false;
  }

  start() {
    this.server = net.createServer((sock) => this.accept(sock));
    this.server.on("error", (e) => this.emit("error", e));
    this.server.listen(this.port, "127.0.0.1", () => this.emit("listening"));
    this.watchdog = setInterval(() => this.setAlive(!!this.socket && Date.now() - this.lastSeen < WATCHDOG_MS), 500);
  }

  accept(sock) {
    if (this.socket) this.socket.destroy(); // only one game at a time
    this.socket = sock;
    sock.setEncoding("utf8");
    sock.setNoDelay(true);
    const reader = new LineReader((msg) => {
      this.lastSeen = Date.now();
      this.setAlive(true);
      this.emit("message", msg);
    });
    sock.on("data", (d) => reader.push(d));
    sock.on("error", () => {});
    sock.on("close", () => {
      if (this.socket !== sock) return;
      this.socket = null;
      this.setAlive(false);
      this.emit("disconnected");
    });
    this.emit("connected");
  }

  setAlive(v) {
    if (v === this.alive) return;
    this.alive = v;
    this.emit("alive", v);
  }

  send(msg) {
    if (this.socket) this.socket.write(JSON.stringify(msg) + "\n");
  }

  stop() {
    clearInterval(this.watchdog);
    if (this.socket) this.socket.destroy();
    if (this.server) this.server.close();
  }
}

module.exports = { GameLink, LineReader };
