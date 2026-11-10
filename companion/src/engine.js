const { PATTERNS, clamp01 } = require("./patterns");

const TAU = Math.PI * 2;
const BOMB_COMBO_WINDOW = 2.5; // seconds
const KILL_MIN_INTERVAL = 0.15;
const PAUSE_DEBOUNCE = 0.3; // ignore short pauses (room transitions)

// Turns game state + events into two output channels [a, b], once per tick.
// Layers: ambient wave (floor/room tension) | heartbeat (low HP) | event patterns.
class Engine {
  constructor(settings) {
    this.settings = settings;
    this.reset();
    this.muted = false;
    this.gameAlive = false;
    this.previews = [];
    this.realTime = 0;
  }

  // Plays a pattern from the UI, even outside a run.
  preview(type) {
    const factory = PATTERNS[type];
    const cfg = this.settings.events[type];
    if (!factory) return;
    this.previews.push({ start: this.realTime, ...factory({ strength: cfg ? cfg.strength : 1, quality: 4, combo: 1, damage: 1 }) });
  }

  samplePreviews() {
    const add = [0, 0];
    this.previews = this.previews.filter((p) => {
      const t = this.realTime - p.start;
      if (t >= p.dur) return false;
      const r = p.sample(t);
      add[0] += r.add[0];
      add[1] += r.add[1];
      return true;
    });
    return add;
  }

  reset() {
    this.inRun = false;
    this.paused = false;
    this.pausedFor = 0;
    this.state = { stage: 1, progress: 0, room: "normal", clear: true, threat: 0, hp: 6, lowHpImmune: false };
    this.tension = 0;
    this.phase = 0;
    this.heartPhase = 0;
    this.active = [];
    this.bombTimes = [];
    this.lastKill = -1;
    this.time = 0;
    this.deadUntil = 0;
  }

  // Messages from the mod (see docs/PROTOCOL.md).
  handle(msg) {
    if (msg.t === "state") {
      this.inRun = !!msg.run;
      this.paused = !!msg.paused;
      Object.assign(this.state, pick(msg, ["stage", "progress", "room", "clear", "threat", "hp", "lowHpImmune"]));
      if (!this.inRun) this.active = [];
    } else if (msg.t === "ev") {
      return this.trigger(msg.e, msg);
    } else if (msg.t === "panic") {
      this.muted = !this.muted;
    }
    return null;
  }

  // Returns a short description of what was triggered (for the UI feed), or null.
  trigger(type, data = {}) {
    if (type === "GAME_START") { this.reset(); this.inRun = true; }
    if (type === "EXIT") { this.reset(); return { type }; }
    if (type === "DEATH") this.deadUntil = this.time + 6;

    const cfg = this.settings.events[type];
    const factory = PATTERNS[type];
    if (!factory || !cfg || !cfg.enabled) return { type, skipped: true };

    const params = { strength: cfg.strength, quality: data.q, damage: data.dmg };
    if (type === "BOMB") {
      const n = Math.max(1, data.n || 1);
      for (let i = 0; i < n; i++) this.bombTimes.push(this.time);
      this.bombTimes = this.bombTimes.filter((t) => this.time - t < BOMB_COMBO_WINDOW);
      params.combo = Math.min(this.bombTimes.length, 6);
      // A new bomb in a combo replaces the previous ripples rather than stacking on them.
      this.active = this.active.filter((p) => p.type !== "BOMB");
    }
    if (type === "KILL") {
      if (this.time - this.lastKill < KILL_MIN_INTERVAL) return null;
      this.lastKill = this.time;
    }
    this.active.push({ type, start: this.time, ...factory(params) });
    return { type, combo: params.combo, quality: data.q };
  }

  targetTension() {
    const s = this.settings, st = this.state;
    const base = Math.min(0.9, s.floorStart + (Math.max(1, st.stage) - 1) * s.floorStep);
    const progress = st.room === "boss" ? Math.max(st.progress, 0.9) : st.progress;
    const floorLevel = base + (1 - base) * clamp01(progress);
    let roomFactor;
    if (st.clear) roomFactor = 0.45;
    else if (st.room === "boss") roomFactor = 0.8 + 0.2 * clamp01(st.threat);
    else roomFactor = 0.6 + 0.4 * clamp01(st.threat);
    return floorLevel * roomFactor;
  }

  lowHpSeverity() {
    const { hp, lowHpImmune } = this.state;
    const th = this.settings.lowHpThreshold;
    if (lowHpImmune || hp > th || hp <= 0) return 0;
    return 1 - (hp - 1) / Math.max(1, th); // 1 at half a heart
  }

  // Advance by dt seconds. Returns { out: [a, b], tension, layers }.
  tick(dt) {
    const s = this.settings;
    this.realTime += dt;
    const preview = this.samplePreviews();
    const cap = (v) => Math.min(s.maxIntensity, clamp01(v));
    if (this.muted) {
      this.previews = [];
      return { out: [0, 0], tension: this.tension, layers: { ambient: 0, heart: 0, events: 0 }, silent: true };
    }
    const silent = !this.gameAlive || !this.inRun;
    if (this.paused) this.pausedFor += dt; else this.pausedFor = 0;
    const frozen = this.pausedFor > PAUSE_DEBOUNCE;
    if (silent || frozen) {
      return { out: preview.map(cap), tension: this.tension, layers: { ambient: 0, heart: 0, events: Math.max(...preview) }, frozen, silent };
    }

    this.time += dt;
    const target = this.time < this.deadUntil ? 0 : this.targetTension();
    const rate = target > this.tension ? 0.25 : 0.15;
    this.tension += Math.sign(target - this.tension) * Math.min(Math.abs(target - this.tension), rate * dt);

    // Ambient breathing: faster and deeper as tension rises.
    const period = 5 - 3.4 * this.tension;
    this.phase = (this.phase + dt / period) % 1;
    const level = this.tension * s.ambientStrength;
    const breath = (p) => 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(TAU * p));
    const ambient = [level * breath(this.phase), level * breath((this.phase + 0.15) % 1)];

    // Heartbeat (lub-dub), faster when lower.
    const sev = this.lowHpSeverity();
    let heart = 0;
    if (sev > 0) {
      const bpm = 70 + 45 * sev;
      this.heartPhase = (this.heartPhase + (dt * bpm) / 60) % 1;
      const p = this.heartPhase;
      const amp = s.heartbeatStrength * (0.6 + 0.4 * sev);
      heart = p < 0.1 ? amp : p < 0.18 ? 0.05 : p < 0.28 ? amp * 0.7 : 0;
    }

    let add = preview, duck = 1;
    this.active = this.active.filter((p) => {
      const t = this.time - p.start;
      if (t >= p.dur) return false;
      const r = p.sample(t);
      add[0] += r.add[0];
      add[1] += r.add[1];
      if (r.duck !== undefined) duck = Math.min(duck, r.duck);
      return true;
    });

    const out = [0, 1].map((i) => cap(Math.max(ambient[i], heart) * duck + add[i]));
    return { out, tension: this.tension, layers: { ambient: ambient[0], heart, events: Math.max(add[0], add[1]) } };
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

module.exports = { Engine };
