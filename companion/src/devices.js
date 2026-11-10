const { EventEmitter } = require("events");
const { ButtplugClient, ButtplugNodeWebsocketClientConnector, DeviceOutput, OutputType } = require("buttplug");

const RETRY_MS = 3000;
const STEP = 0.05; // output resolution; avoids flooding BLE with tiny changes
const OUTPUTS = [OutputType.Vibrate, OutputType.Oscillate, OutputType.Rotate, OutputType.Constrict];

// One motor/actuator. Sends only on change, at most once per gap; latest value wins.
class Channel {
  constructor(feature, type, gapMs) {
    this.feature = feature;
    this.type = type;
    this.gapMs = gapMs;
    this.sent = null;
    this.lastAt = 0;
    this.inFlight = false;
  }
  update(value, now) {
    const v = Math.round(Math.max(0, Math.min(1, value)) / STEP) * STEP;
    if (v === this.sent || this.inFlight || now - this.lastAt < this.gapMs) return;
    this.inFlight = true;
    this.lastAt = now;
    this.feature
      .runOutput(DeviceOutput[this.type].percent(v))
      .then(() => (this.sent = v))
      .catch(() => {})
      .finally(() => (this.inFlight = false));
  }
}

// Intiface connection with auto-reconnect and a per-device channel map.
// Emits: status({ connected, devices }), log(string).
class Devices extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.client = null;
    this.connected = false;
    this.devices = new Map(); // index → { device, channels: [{ ch, slot }] }
    this.stopped = false;
  }

  async start() {
    while (!this.stopped) {
      try {
        await this.connect();
        return;
      } catch (e) {
        if (!this.warned) this.emit("log", `Intiface not reachable at ${this.settings.intifaceUrl}, retrying…`);
        this.warned = true;
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
    }
  }

  async connect() {
    const client = new ButtplugClient("Binding of the Butt");
    client.on("deviceadded", (d) => this.add(d));
    client.on("deviceremoved", (d) => this.remove(d));
    client.on("disconnect", () => {
      if (this.client !== client) return;
      this.client = null;
      this.connected = false;
      this.devices.clear();
      this.emit("log", "Intiface disconnected");
      this.emitStatus();
      if (!this.stopped) setTimeout(() => this.start(), RETRY_MS);
    });
    await client.connect(new ButtplugNodeWebsocketClientConnector(this.settings.intifaceUrl));
    this.client = client;
    this.connected = true;
    this.warned = false;
    this.emit("log", `Connected to ${client.serverInfo?.serverName || "Intiface"}`);
    for (const d of client.devices.values()) this.add(d);
    this.emitStatus();
    await this.scan();
  }

  async scan() {
    if (this.client) await this.client.startScanning().catch(() => {});
  }

  add(device) {
    if (this.devices.has(device.index)) return;
    const gap = Math.max(this.settings.minGapMs, device.messageTimingGap || 0);
    const channels = [];
    for (const f of [...device.features.values()].sort((a, b) => a.index - b.index)) {
      const type = OUTPUTS.find((t) => f.hasOutput(t));
      if (type) channels.push({ ch: new Channel(f, type, gap), slot: channels.length % 2 });
    }
    this.devices.set(device.index, { device, channels });
    this.emit("log", `Toy connected: ${device.name} (${channels.map((c) => c.ch.type).join(", ") || "no supported output"})`);
    this.emitStatus();
  }

  remove(device) {
    if (!this.devices.delete(device.index)) return;
    this.emit("log", `Toy disconnected: ${device.name}`);
    this.emitStatus();
  }

  deviceConfig(name) {
    return { enabled: true, scale: 1, ...(this.settings.devices[name] || {}) };
  }

  // out = [a, b]; single-motor toys get the stronger of the two.
  drive(out) {
    const now = Date.now();
    const values = {};
    for (const { device, channels } of this.devices.values()) {
      const cfg = this.deviceConfig(device.name);
      const k = cfg.enabled ? cfg.scale : 0;
      const single = channels.length === 1;
      values[device.index] = channels.map(({ ch, slot }) => {
        const v = Math.min(this.settings.maxIntensity, (single ? Math.max(out[0], out[1]) : out[slot]) * k);
        ch.update(v, now);
        return v;
      });
    }
    return values;
  }

  list() {
    return [...this.devices.values()].map(({ device, channels }) => ({
      index: device.index,
      name: device.displayName || device.name,
      key: device.name,
      outputs: channels.map((c) => c.ch.type),
      ...this.deviceConfig(device.name),
    }));
  }

  emitStatus() {
    this.emit("status", { connected: this.connected, devices: this.list() });
  }

  async stopAll() {
    if (this.client) await this.client.stopAllDevices().catch(() => {});
    for (const { channels } of this.devices.values()) for (const { ch } of channels) ch.sent = 0;
  }

  async shutdown() {
    this.stopped = true;
    await this.stopAll();
    if (this.client) await this.client.disconnect().catch(() => {});
  }
}

module.exports = { Devices, Channel };
