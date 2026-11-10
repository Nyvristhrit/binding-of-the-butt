// Simulates the Isaac mod (protocol v2) for testing without the game.
// Usage: node tools/fake-isaac.js [scenario]   scenarios: tour (default), bombs, lowhp
const net = require("net");

const sock = net.connect(58711, "127.0.0.1");
const t0 = Date.now();
const stamp = () => `+${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s`;
const send = (o) => sock.write(JSON.stringify(o) + "\n");
let state = { t: "state", run: true, paused: false, stage: 1, progress: 0, room: "normal", clear: true, threat: 0, hp: 6, lowHpImmune: false };

const SCENARIOS = {
  tour: [
    [0, "Run start", { ev: "GAME_START" }],
    [3, "Enter a fight (floor 1)", { state: { clear: false, threat: 1 } }],
    [6, "Kills", { ev: "KILL" }],
    [7, "", { ev: "KILL", state: { threat: 0.6 } }],
    [9, "Hurt", { ev: "HURT", dmg: 1 }],
    [12, "Bomb", { ev: "BOMB" }],
    [14, "Room cleared", { ev: "ROOM_CLEAR", state: { clear: true, threat: 0, progress: 0.3 } }],
    [18, "Item (quality 4)", { ev: "ITEM", q: 4 }],
    [22, "Later in the floor, fight", { state: { progress: 0.8, clear: false, threat: 1 } }],
    [30, "Boss room", { state: { room: "boss", threat: 1 } }],
    [38, "Boss defeated", { ev: "BOSS_DEFEATED", state: { clear: true, threat: 0, progress: 1 } }],
    [46, "Pause (toys should stop)", { state: { paused: true } }],
    [50, "Resume", { state: { paused: false } }],
    [52, "New floor (2)", { ev: "NEW_FLOOR", state: { stage: 2, progress: 0, room: "normal" } }],
    [55, "Devil room", { ev: "DEVIL_ROOM", state: { room: "devil" } }],
    [60, "Low HP", { state: { room: "normal", hp: 1, clear: false, threat: 0.8 } }],
    [68, "Death", { ev: "DEATH", state: { hp: 0 } }],
    [74, "Exit to menu", { ev: "EXIT", state: { run: false } }],
  ],
  bombs: [
    [0, "Run start", { ev: "GAME_START" }],
    [3, "One bomb", { ev: "BOMB" }],
    [7, "Golden bomb spam", { ev: "BOMB" }],
    ...[7.6, 8.2, 8.8, 9.4, 10, 10.6].map((t) => [t, "", { ev: "BOMB" }]),
    [16, "Exit", { ev: "EXIT", state: { run: false } }],
  ],
  lowhp: [
    [0, "Run start", { ev: "GAME_START", state: { clear: false, threat: 0.5, progress: 0.4 } }],
    [3, "2 half hearts", { state: { hp: 2 } }],
    [9, "1 half heart", { state: { hp: 1 } }],
    [15, "Healed", { state: { hp: 6 } }],
    [18, "Exit", { ev: "EXIT", state: { run: false } }],
  ],
};

const steps = SCENARIOS[process.argv[2] || "tour"];
if (!steps) throw new Error(`Unknown scenario. Use: ${Object.keys(SCENARIOS).join(", ")}`);

sock.on("connect", () => {
  console.log("Connected to companion");
  send({ t: "hello", v: 2, mod: "fake" });
  const heartbeat = setInterval(() => send(state), 330);
  for (const [t, label, step] of steps) {
    setTimeout(() => {
      if (step.state) state = { ...state, ...step.state };
      if (step.ev) send({ t: "ev", e: step.ev, q: step.q, dmg: step.dmg });
      send(state);
      if (label) console.log(stamp(), label);
    }, t * 1000);
  }
  const end = steps[steps.length - 1][0] + 2;
  setTimeout(() => { clearInterval(heartbeat); sock.end(); console.log(stamp(), "done"); }, end * 1000);
});
sock.on("data", (d) => process.stdout.write(`        ← ${d}`));
sock.on("error", (e) => console.error("error:", e.message));
