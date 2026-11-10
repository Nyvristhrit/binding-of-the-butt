// Event patterns. Each factory returns { dur, sample(t) } where sample gives
// { add: [a, b] } (added on top of the ambient layer) and optionally
// { duck } (multiplier applied to the ambient layer, 0..1).
// Channel a = primary motor, b = secondary motor (e.g. Lovense Edge external).

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x)); // 0→1 ease
const pulse = (t, start, len) => (t >= start && t < start + len ? 1 : 0);
const both = (v) => [v, v];

// Shock then decaying ripples; channel b lags slightly to feel like propagation.
function bomb({ strength = 1, combo = 1 }) {
  const amp = clamp01(0.4 * strength * (1 + 0.45 * (combo - 1)));
  const ripples = Math.min(2 + combo, 6);
  const period = 0.32;
  const dur = 0.12 + ripples * period;
  const at = (t) => {
    if (t < 0) return 0;
    if (t < 0.12) return amp;
    const r = (t - 0.12) / period;
    if (r >= ripples) return 0;
    return amp * 0.75 * Math.exp(-r * 0.9) * (0.5 - 0.5 * Math.cos(TAU * r));
  };
  return { dur: dur + 0.08, sample: (t) => ({ add: [at(t), at(t - 0.08)] }) };
}

// Sharp jolt, then the ambient is cut briefly (the "ouch" drop).
function hurt({ strength = 1, damage = 1 }) {
  const amp = clamp01(0.7 * strength * (damage >= 2 ? 1.25 : 1));
  return {
    dur: 1.2,
    sample: (t) => {
      if (t < 0.25) return { add: both(amp), duck: 1 };
      if (t < 0.75) return { add: both(0), duck: 0.05 };
      return { add: both(0), duck: smooth((t - 0.75) / 0.45) };
    },
  };
}

function kill({ strength = 1 }) {
  const amp = clamp01(0.18 * strength);
  return { dur: 0.15, sample: (t) => ({ add: both(t < 0.12 ? amp : 0) }) };
}

// Growing waves, full blast, then fade out.
function bossDefeated({ strength = 1 }) {
  const top = clamp01(strength);
  return {
    dur: 7,
    sample: (t) => {
      if (t < 4) {
        const env = 0.2 + 0.6 * (t / 4);
        return { add: both(top * env * (0.5 - 0.5 * Math.cos(TAU * t / 0.8))) };
      }
      if (t < 5.5) return { add: both(top), duck: 1 };
      return { add: both(top * (1 - smooth((t - 5.5) / 1.5))) };
    },
  };
}

// Better items sweep higher and longer.
function item({ strength = 1, quality = 2 }) {
  const q = Math.max(0, Math.min(4, quality));
  const amp = clamp01((0.25 + 0.15 * q) * strength);
  const rise = 0.4 + 0.35 * q;
  const hold = q >= 3 ? 0.4 * (q - 2) : 0;
  return {
    dur: rise + hold + 0.5,
    sample: (t) => {
      if (t < rise) return { add: both(amp * smooth(t / rise)) };
      if (t < rise + hold) {
        const sparkle = q === 4 ? 0.15 * (pulse(t % 0.2, 0, 0.1) ? 1 : -1) : 0;
        return { add: both(clamp01(amp + sparkle)) };
      }
      return { add: both(amp * (1 - smooth((t - rise - hold) / 0.5))) };
    },
  };
}

// A sigh of relief: one soft wave.
function roomClear({ strength = 1 }) {
  const amp = clamp01(0.3 * strength);
  return { dur: 1.6, sample: (t) => ({ add: both(amp * Math.sin(Math.PI * t / 1.6)) }) };
}

function newFloor({ strength = 1 }) {
  const amp = clamp01(0.45 * strength);
  return {
    dur: 1.5,
    sample: (t) => ({ add: both(pulse(t, 0, 0.15) || pulse(t, 0.35, 0.15) || pulse(t, 0.7, 0.4) ? amp : 0) }),
  };
}

// Slow heavy throb.
function devilRoom({ strength = 1 }) {
  const amp = clamp01(0.5 * strength);
  return { dur: 3.6, sample: (t) => ({ add: both(amp * Math.pow(0.5 - 0.5 * Math.cos(TAU * t / 1.2), 2)) }) };
}

// Light fast shimmer, alternating motors.
function angelRoom({ strength = 1 }) {
  const amp = clamp01(0.3 * strength);
  return {
    dur: 3,
    sample: (t) => {
      const s = 0.5 - 0.5 * Math.cos(TAU * t / 0.25);
      const env = Math.sin(Math.PI * t / 3);
      return { add: [amp * env * s, amp * env * (1 - s)] };
    },
  };
}

function activeItem({ strength = 1 }) {
  const amp = clamp01(0.4 * strength);
  return { dur: 0.7, sample: (t) => ({ add: both(t < 0.5 ? amp * smooth(t / 0.5) : amp * (1 - (t - 0.5) / 0.2)) }) };
}

// Pills and cards: an unpredictable flutter.
function flutter({ strength = 1 }) {
  const amp = clamp01(0.35 * strength);
  const seq = Array.from({ length: 8 }, () => Math.random());
  return { dur: 1.2, sample: (t) => ({ add: both(amp * seq[Math.min(7, Math.floor(t / 0.15))]) }) };
}

// Run start: wake-up ramp.
function gameStart({ strength = 1 }) {
  const amp = clamp01(0.35 * strength);
  return { dur: 2, sample: (t) => ({ add: both(amp * Math.sin(Math.PI * t / 2)) }) };
}

// Death: one last hit, then waves dying out; ambient is cut.
function death({ strength = 1 }) {
  const amp = clamp01(0.8 * strength);
  return {
    dur: 4.5,
    sample: (t) => {
      const v = t < 0.4 ? amp : amp * Math.exp(-(t - 0.4) * 0.8) * (0.5 - 0.5 * Math.cos(TAU * (t - 0.4) / 0.9));
      return { add: both(v), duck: 0 };
    },
  };
}

function win({ strength = 1 }) {
  const amp = clamp01(strength);
  return {
    dur: 6,
    sample: (t) => {
      const s = 0.5 - 0.5 * Math.cos(TAU * t / 0.5);
      return { add: [amp * (0.4 + 0.6 * s), amp * (0.4 + 0.6 * (1 - s))], duck: 1 };
    },
  };
}

// Event type → pattern. Keys are the event names sent by the mod.
const PATTERNS = {
  BOMB: bomb,
  HURT: hurt,
  KILL: kill,
  BOSS_DEFEATED: bossDefeated,
  ITEM: item,
  ROOM_CLEAR: roomClear,
  NEW_FLOOR: newFloor,
  DEVIL_ROOM: devilRoom,
  ANGEL_ROOM: angelRoom,
  ACTIVE_ITEM: activeItem,
  PILL: flutter,
  CARD: flutter,
  GAME_START: gameStart,
  DEATH: death,
  WIN: win,
};

module.exports = { PATTERNS, clamp01, smooth };
