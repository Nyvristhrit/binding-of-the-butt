const test = require("node:test");
const assert = require("node:assert");
const { LineReader } = require("../src/game-link");
const { Channel } = require("../src/devices");

test("LineReader reassembles messages split across chunks", () => {
  const got = [];
  const r = new LineReader((m) => got.push(m));
  r.push('{"t":"ev","e":"BO');
  r.push('MB"}\n{"t":"ev","e":"HURT"}\n{"t":');
  assert.deepStrictEqual(got.map((m) => m.e), ["BOMB", "HURT"]);
  r.push('"panic"}\nnot json\n');
  assert.strictEqual(got.length, 3);
});

test("Channel sends only on change and respects the gap", async () => {
  const sent = [];
  const feature = { runOutput: async (cmd) => sent.push(cmd.percent) };
  const ch = new Channel(feature, "Vibrate", 100);
  ch.update(0.5, 1000);
  await new Promise((r) => setImmediate(r));
  ch.update(0.5, 1200); // unchanged
  ch.update(0.8, 1050); // too soon
  ch.update(0.8, 1150);
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(sent, [0.5, 0.8]);
});
