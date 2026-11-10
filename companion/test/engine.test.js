const test = require("node:test");
const assert = require("node:assert");
const { Engine } = require("../src/engine");
const { DEFAULTS, merge } = require("../src/settings");
const { PATTERNS } = require("../src/patterns");

const make = (over = {}) => {
  const e = new Engine(merge(DEFAULTS, over));
  e.gameAlive = true;
  e.trigger("GAME_START");
  return e;
};
const run = (e, seconds, dt = 0.05) => {
  let r, peak = 0;
  for (let t = 0; t < seconds; t += dt) {
    r = e.tick(dt);
    peak = Math.max(peak, ...r.out);
  }
  return { last: r, peak };
};
const state = (e, s) => e.handle({ t: "state", run: true, paused: false, ...s });

test("silent outside a run, when muted, or when the game stops talking", () => {
  const e = new Engine(merge(DEFAULTS, {}));
  e.gameAlive = true;
  assert.deepStrictEqual(e.tick(0.05).out, [0, 0]);

  const m = make();
  state(m, { stage: 3, progress: 1, clear: false, threat: 1 });
  run(m, 5);
  m.muted = true;
  assert.deepStrictEqual(m.tick(0.05).out, [0, 0]);
  m.muted = false;
  m.gameAlive = false;
  assert.deepStrictEqual(m.tick(0.05).out, [0, 0]);
});

test("pause freezes output after the debounce, short pauses are ignored", () => {
  const e = make();
  state(e, { stage: 2, progress: 0.5, clear: false, threat: 1 });
  run(e, 5);
  state(e, { stage: 2, progress: 0.5, clear: false, threat: 1, paused: true });
  assert.ok(Math.max(...e.tick(0.1).out) > 0, "short pause still plays");
  const { last } = run(e, 1);
  assert.deepStrictEqual(last.out, [0, 0]);
});

test("output never exceeds maxIntensity", () => {
  const e = make({ maxIntensity: 0.5 });
  state(e, { stage: 8, progress: 1, room: "boss", clear: false, threat: 1, hp: 1 });
  for (let i = 0; i < 10; i++) e.trigger("BOMB");
  e.trigger("BOSS_DEFEATED");
  e.trigger("HURT", { dmg: 2 });
  const { peak } = run(e, 8);
  assert.ok(peak <= 0.5 + 1e-9, `peak ${peak}`);
});

test("tension ramps with floor progress and each floor starts higher", () => {
  const e = make();
  state(e, { stage: 1, progress: 0, clear: false, threat: 1 });
  run(e, 20);
  const early = e.tension;
  state(e, { stage: 1, progress: 1, clear: false, threat: 1 });
  run(e, 20);
  assert.ok(e.tension > early + 0.3, `${early} → ${e.tension}`);

  const f1 = make(), f4 = make();
  state(f1, { stage: 1, progress: 0, clear: false, threat: 1 });
  state(f4, { stage: 4, progress: 0, clear: false, threat: 1 });
  run(f1, 20);
  run(f4, 20);
  assert.ok(f4.tension > f1.tension);
});

test("cleared room is calmer than combat", () => {
  const fight = make(), calm = make();
  state(fight, { stage: 3, progress: 0.5, clear: false, threat: 1 });
  state(calm, { stage: 3, progress: 0.5, clear: true, threat: 0 });
  run(fight, 20);
  run(calm, 20);
  assert.ok(fight.tension > calm.tension);
});

test("bomb combo grows but is bounded and does not stack ripples", () => {
  const e = make({ maxIntensity: 1 });
  state(e, { clear: true, progress: 0 });
  const peakFor = (n) => {
    const x = make({ maxIntensity: 1 });
    state(x, { clear: true, progress: 0 });
    for (let i = 0; i < n; i++) {
      x.trigger("BOMB");
      run(x, 0.3);
    }
    return run(x, 0.2).peak;
  };
  assert.ok(peakFor(4) > peakFor(1));
  e.trigger("BOMB");
  e.trigger("BOMB");
  assert.strictEqual(e.active.filter((p) => p.type === "BOMB").length, 1);
});

test("heartbeat only when low and not for immune characters", () => {
  const low = make(), lost = make();
  state(low, { hp: 1, clear: true, progress: 0 });
  state(lost, { hp: 0, lowHpImmune: true, clear: true, progress: 0 });
  assert.ok(low.lowHpSeverity() > 0);
  assert.strictEqual(lost.lowHpSeverity(), 0);
  assert.ok(run(low, 3).peak > 0.4);
});

test("disabled event does nothing; preview works outside a run", () => {
  const e = make({ events: { BOMB: { enabled: false } } });
  assert.ok(e.trigger("BOMB").skipped);
  const idle = new Engine(merge(DEFAULTS, {}));
  idle.preview("BOSS_DEFEATED");
  assert.ok(run(idle, 6).peak > 0.5);
});

test("every pattern stays within [0, 1] and ends", () => {
  for (const [name, f] of Object.entries(PATTERNS)) {
    const p = f({ strength: 2, combo: 6, quality: 4, damage: 2 });
    assert.ok(p.dur > 0 && p.dur < 10, name);
    for (let t = 0; t < p.dur; t += 0.02) {
      const r = p.sample(t);
      for (const v of r.add) assert.ok(v >= 0 && v <= 1, `${name} t=${t} v=${v}`);
    }
  }
});
