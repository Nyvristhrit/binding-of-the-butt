#!/usr/bin/env node
const { exec } = require("child_process");
const settingsStore = require("./settings");
const { Engine } = require("./engine");
const { GameLink } = require("./game-link");
const { Devices } = require("./devices");
const { startWeb } = require("./web");
const { PATTERNS } = require("./patterns");
const { version } = require("../package.json");

const TICK_MS = 50;
const FRAME_EVERY = 2; // UI frames at 10 Hz

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

async function main() {
  let settings = settingsStore.load();
  const engine = new Engine(settings);
  const devices = new Devices(settings);
  const game = new GameLink(settings.gamePort);
  let web = { broadcast: () => {} };
  const feed = [];

  const applySettings = (next) => {
    settings = next;
    engine.settings = devices.settings = settings;
    settingsStore.save(settings);
    web.broadcast({ type: "settings", settings });
  };

  const gameStatus = () => ({ alive: game.alive, inRun: engine.inRun, paused: engine.paused, muted: engine.muted, ...engine.state });

  const pushStatusToGame = () =>
    game.send({ t: "status", intiface: devices.connected, toys: devices.devices.size, muted: engine.muted });

  const setMuted = (v) => {
    engine.muted = v;
    if (v) devices.stopAll();
    log(v ? "Muted" : "Unmuted");
    web.broadcast({ type: "game", game: gameStatus() });
    pushStatusToGame();
  };

  const pushFeed = (entry) => {
    const item = { ...entry, at: Date.now() };
    feed.push(item);
    if (feed.length > 50) feed.shift();
    web.broadcast({ type: "event", event: item });
  };

  devices.on("log", (m) => log(m));
  devices.on("status", (s) => {
    web.broadcast({ type: "devices", ...s });
    pushStatusToGame();
  });

  game.on("listening", () => log(`Waiting for Isaac on port ${settings.gamePort}`));
  game.on("error", (e) => log("Game link error:", e.message));
  game.on("connected", () => {
    log("Isaac connected");
    pushStatusToGame();
  });
  game.on("disconnected", () => log("Isaac disconnected"));
  game.on("alive", (v) => {
    engine.gameAlive = v;
    if (!v) devices.stopAll();
    web.broadcast({ type: "game", game: gameStatus() });
  });
  game.on("message", (msg) => {
    const wasMuted = engine.muted;
    const wasPaused = engine.paused;
    const fired = engine.handle(msg);
    if (fired && !fired.skipped) pushFeed(fired);
    if (msg.t === "hello") log(`Mod v${msg.mod || "?"} says hello`);
    if (engine.muted !== wasMuted) setMuted(engine.muted);
    if (msg.t === "hello" || engine.paused !== wasPaused) web.broadcast({ type: "game", game: gameStatus() });
  });

  const onCommand = (msg, reply) => {
    switch (msg.type) {
      case "setSettings":
        return applySettings(settingsStore.merge(settings, msg.patch));
      case "resetSettings":
        return applySettings(settingsStore.merge(settingsStore.DEFAULTS, { language: settings.language }));
      case "device":
        return applySettings(settingsStore.merge(settings, { devices: { [msg.key]: msg.patch } }));
      case "mute":
        return setMuted(!!msg.value);
      case "preview":
        return engine.preview(msg.event);
      case "scan":
        return devices.scan();
      default:
        return reply({ type: "error", message: `Unknown command ${msg.type}` });
    }
  };

  const host = settings.lanAccess ? "0.0.0.0" : "127.0.0.1";
  try {
    web = await startWeb({
      port: settings.webPort,
      host,
      onCommand,
      onConnect: (reply) =>
        reply({
          type: "hello",
          version,
          settings,
          events: Object.keys(PATTERNS),
          devices: { connected: devices.connected, devices: devices.list() },
          game: gameStatus(),
          feed,
        }),
    });
    const url = `http://127.0.0.1:${settings.webPort}`;
    log(`Control panel: ${url}`);
    if (settings.openBrowser && process.platform === "win32") exec(`start "" "${url}"`);
  } catch (e) {
    log(`Control panel unavailable (port ${settings.webPort}): ${e.message}`);
  }

  game.start();
  devices.start();

  let last = Date.now(), n = 0;
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const r = engine.tick(dt);
    const values = devices.drive(r.out);
    if (++n % FRAME_EVERY === 0) {
      web.broadcast({ type: "frame", out: r.out, tension: r.tension, layers: r.layers, values, frozen: !!r.frozen });
    }
  }, TICK_MS);
  setInterval(() => web.broadcast({ type: "game", game: gameStatus() }), 1000);

  const shutdown = async () => {
    log("Stopping toys…");
    await devices.shutdown();
    game.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  log(`Binding of the Butt companion v${version} — settings: ${settingsStore.file}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
