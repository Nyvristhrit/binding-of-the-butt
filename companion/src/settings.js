const fs = require("fs");
const path = require("path");
const { PATTERNS } = require("./patterns");

const DEFAULTS = {
  language: "en",
  maxIntensity: 0.8, // hard cap applied to every motor
  ambientStrength: 0.7,
  heartbeatStrength: 0.85,
  lowHpThreshold: 2, // in half hearts
  floorStart: 0.2, // ambient level at the start of floor 1
  floorStep: 0.08, // added to the start level on each new floor
  minGapMs: 100,
  webPort: 7878,
  lanAccess: false,
  openBrowser: true,
  intifaceUrl: "ws://127.0.0.1:12345",
  gamePort: 58711,
  events: Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, { enabled: true, strength: 1 }])),
  devices: {}, // name → { enabled, scale }
};

// Next to the exe when packaged, next to package.json in dev.
const dataDir = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, "..");
const file = path.join(dataDir, "settings.json");

function merge(base, over) {
  if (typeof base !== "object" || base === null || Array.isArray(base)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

function load() {
  try {
    return merge(DEFAULTS, JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[settings] unreadable, using defaults:", e.message);
    return merge(DEFAULTS, {});
  }
}

function save(settings) {
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
}

module.exports = { DEFAULTS, load, save, merge, file };
