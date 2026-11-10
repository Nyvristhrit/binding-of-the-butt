(() => {
  const $ = (s) => document.querySelector(s);
  const HISTORY = 150; // 15 s at 10 Hz
  const INK = ["#c8262f", "#3f6fb5", "#6c3f7a", "#3f7a3c", "#8a5a1c", "#1f7a7a"];
  const GLYPH = {
    GAME_START: "🎬", EXIT: "🚪", BOMB: "💣", HURT: "💔", KILL: "🗡️", BOSS_DEFEATED: "👑", ITEM: "✨",
    ROOM_CLEAR: "🧹", NEW_FLOOR: "🪜", DEVIL_ROOM: "😈", ANGEL_ROOM: "😇", ACTIVE_ITEM: "🔋",
    PILL: "💊", CARD: "🃏", DEATH: "💀", WIN: "🏆",
  };

  let ws, settings = null, eventTypes = [], devices = { connected: false, devices: [] }, game = {};
  const traces = new Map(); // "index:motor" → number[]
  const tensionHist = [];
  let marks = []; // events drawn on the strip
  let lang = "en";
  const t = (k, ...a) => {
    const v = (I18N[lang] || I18N.en)[k] ?? I18N.en[k];
    return typeof v === "function" ? v(...a) : v;
  };

  // ---------- connection
  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (e) => handle(JSON.parse(e.data));
    ws.onclose = () => {
      setStatus("#st-game", "off", t("gameOff"));
      setStatus("#st-intiface", "off", "Companion offline");
      setTimeout(connect, 1500);
    };
  }
  const send = (msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

  function handle(m) {
    switch (m.type) {
      case "hello":
        settings = m.settings;
        eventTypes = m.events;
        devices = m.devices;
        game = m.game;
        lang = settings.language || "en";
        $("#version").textContent = `v${m.version}`;
        $("#feed").innerHTML = "";
        m.feed.forEach(addFeed);
        renderAll();
        break;
      case "settings":
        settings = m.settings;
        if (settings.language !== lang) { lang = settings.language; renderAll(); } else syncControls();
        break;
      case "devices":
        devices = m;
        renderToys();
        renderStatus();
        break;
      case "game":
        game = m.game;
        renderStatus();
        break;
      case "event":
        addFeed(m.event);
        break;
      case "frame":
        onFrame(m);
        break;
    }
  }

  // ---------- rendering
  function renderAll() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $("#lang").textContent = t("langSwitch");
    renderLogToggle();
    $("#scope").setAttribute("aria-label", t("scopeLabel"));
    renderEvents();
    renderToys();
    renderStatus();
    syncControls();
    document.querySelectorAll("#feed li").forEach((li) => (li.querySelector(".what").firstChild.textContent = t("ev")[li.dataset.type] || li.dataset.type));
  }

  function setStatus(sel, state, text) {
    const el = $(sel);
    el.dataset.state = state;
    el.querySelector(".txt").textContent = text;
  }

  function renderStatus() {
    const g = !game.alive ? ["off", t("gameOff")] : !game.inRun ? ["warn", t("gameMenu")] : game.paused ? ["warn", t("gamePaused")] : ["on", `${t("gameRun")}, ${t("floor", game.stage || 1)}`];
    setStatus("#st-game", ...g);
    const n = devices.devices.length;
    setStatus("#st-intiface", devices.connected ? (n ? "on" : "warn") : "off", devices.connected ? t("intifaceOn", n) : t("intifaceOff"));
    const stop = $("#stop");
    stop.textContent = game.muted ? t("resume") : t("stop");
    stop.setAttribute("aria-pressed", String(!!game.muted));
  }

  function slider(min, max, step, value, oninput) {
    const r = Object.assign(document.createElement("input"), { type: "range", min, max, step, value });
    fill(r);
    r.addEventListener("input", () => {
      fill(r);
      oninput(Number(r.value));
    });
    return r;
  }

  const cards = new Map(); // event type → card element

  // Gold fill of a range track (WebKit has no native progress pseudo-element).
  function fill(r) {
    r.style.setProperty("--v", `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  }

  function renderEvents() {
    const ul = $("#board");
    ul.innerHTML = "";
    cards.clear();
    for (const type of eventTypes) {
      const cfg = settings.events[type] || { enabled: true, strength: 1 };
      const name = t("ev")[type] || type;
      const li = Object.assign(document.createElement("li"), { className: "card" });
      li.classList.toggle("off", !cfg.enabled);

      const icon = Object.assign(document.createElement("button"), { type: "button", className: "icon", textContent: GLYPH[type] || "•" });
      icon.setAttribute("aria-label", `${t("try")}: ${name}`);
      icon.addEventListener("click", () => {
        send({ type: "preview", event: type });
        marks.push({ type, at: Date.now() });
        flash(type);
      });

      const sw = Object.assign(document.createElement("input"), { type: "checkbox", className: "switch", checked: cfg.enabled });
      sw.setAttribute("aria-label", name);
      sw.addEventListener("change", () => patch({ events: { [type]: { enabled: sw.checked } } }));

      const value = Object.assign(document.createElement("output"), { textContent: `${Math.round(cfg.strength * 100)}%` });
      const strength = slider(0, 2, 0.1, cfg.strength, (v) => {
        value.textContent = `${Math.round(v * 100)}%`;
        patch({ events: { [type]: { strength: v } } }, true);
      });
      strength.setAttribute("aria-label", `${name} strength`);
      const meter = Object.assign(document.createElement("div"), { className: "meter" });
      meter.append(strength, value);

      li.append(icon, sw, Object.assign(document.createElement("span"), { className: "name", textContent: name }), meter);
      cards.set(type, li);
      ul.append(li);
    }
  }

  function flash(type) {
    const card = cards.get(type);
    if (!card) return;
    card.classList.remove("lit");
    void card.offsetWidth; // restart the animation
    card.classList.add("lit");
    clearTimeout(card._lit);
    card._lit = setTimeout(() => card.classList.remove("lit"), 1800);
  }

  function renderToys() {
    const ul = $("#toys");
    ul.innerHTML = "";
    $("#toys-empty").hidden = devices.devices.length > 0;
    devices.devices.forEach((d) => {
      const li = document.createElement("li");
      li.classList.toggle("off", !d.enabled);
      const sw = Object.assign(document.createElement("input"), { type: "checkbox", className: "switch", checked: d.enabled });
      sw.setAttribute("aria-label", d.name);
      sw.addEventListener("change", () => send({ type: "device", key: d.key, patch: { enabled: sw.checked } }));
      const tname = Object.assign(document.createElement("span"), { className: "tname", textContent: d.name });
      tname.append(Object.assign(document.createElement("span"), { className: "outs", textContent: d.outputs.map((o, i) => (d.outputs.length > 1 ? t("motor", i) : o)).join(" + ") }));
      const value = Object.assign(document.createElement("output"), { textContent: `${Math.round(d.scale * 100)}%` });
      const scale = slider(0, 1, 0.05, d.scale, (v) => {
        value.textContent = `${Math.round(v * 100)}%`;
        throttled(`dev${d.key}`, () => send({ type: "device", key: d.key, patch: { scale: v } }));
      });
      scale.setAttribute("aria-label", `${d.name} scale`);
      li.append(sw, tname, scale, value);
      ul.append(li);
    });
    renderLegend();
  }

  // One trace per motor; without toys, the two raw output channels.
  function traceKeys() {
    if (!devices.devices.length) return [0, 1].map((m) => ({ key: `out:${m}`, label: t("output", m) }));
    return devices.devices.flatMap((d) =>
      d.outputs.map((_, m) => ({ key: `${d.index}:${m}`, label: d.outputs.length > 1 ? `${d.name}, ${t("motor", m)}` : d.name })),
    );
  }

  function renderLegend() {
    const ul = $("#legend");
    ul.innerHTML = "";
    traceKeys().forEach(({ label }, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<i style="background:${INK[i % INK.length]}"></i>`;
      li.append(label);
      ul.append(li);
    });
  }

  function syncControls() {
    document.querySelectorAll(".slider input").forEach((input) => {
      const v = settings[input.dataset.key];
      if (document.activeElement !== input) input.value = v;
      fill(input);
      input.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
    });
  }

  function addFeed(ev) {
    $("#feed-empty").hidden = true;
    const li = document.createElement("li");
    li.dataset.type = ev.type;
    const extra = ev.combo > 1 ? t("combo", ev.combo) : ev.type === "ITEM" && ev.quality !== undefined ? t("quality", ev.quality) : "";
    const time = new Date(ev.at).toLocaleTimeString("en-GB");
    if (Date.now() - ev.at < HISTORY * 100) marks.push({ type: ev.type, at: ev.at });
    if (Date.now() - ev.at < 2000) flash(ev.type);
    li.innerHTML = `<span class="glyph" aria-hidden="true">${GLYPH[ev.type] || "•"}</span><span class="what"></span><time></time>`;
    li.querySelector(".what").append(t("ev")[ev.type] || ev.type);
    if (extra) li.querySelector(".what").append(Object.assign(document.createElement("span"), { className: "extra", textContent: extra }));
    li.querySelector("time").textContent = time;
    const feed = $("#feed");
    feed.prepend(li);
    while (feed.children.length > 50) feed.lastChild.remove();
  }

  // ---------- settings
  const timers = {};
  function throttled(key, fn) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, 120);
  }
  function patch(p, throttle) {
    const go = () => send({ type: "setSettings", patch: p });
    throttle ? throttled(JSON.stringify(Object.keys(p.events || p)), go) : go();
  }
  document.querySelectorAll(".slider input").forEach((input) => {
    input.addEventListener("input", () => {
      input.nextElementSibling.textContent = `${Math.round(input.value * 100)}%`;
      fill(input);
      throttled(input.dataset.key, () => send({ type: "setSettings", patch: { [input.dataset.key]: Number(input.value) } }));
    });
  });
  $("#lang").addEventListener("click", () => send({ type: "setSettings", patch: { language: lang === "en" ? "fr" : "en" } }));
  $("#stop").addEventListener("click", () => send({ type: "mute", value: !game.muted }));
  $("#scan").addEventListener("click", () => send({ type: "scan" }));
  $("#reset").addEventListener("click", () => send({ type: "resetSettings" }));

  let logOpen = true;
  const renderLogToggle = () => {
    $("#log-body").hidden = !logOpen;
    $("#log-toggle").textContent = logOpen ? t("hide") : t("show");
    $("#log-toggle").setAttribute("aria-expanded", String(logOpen));
  };
  $("#log-toggle").addEventListener("click", () => {
    logOpen = !logOpen;
    renderLogToggle();
  });

  // ---------- seismograph
  function onFrame(f) {
    for (const d of devices.devices) {
      (f.values[d.index] || []).forEach((v, m) => {
        const key = `${d.index}:${m}`;
        if (!traces.has(key)) traces.set(key, []);
        const arr = traces.get(key);
        arr.push(v);
        if (arr.length > HISTORY) arr.shift();
      });
    }
    // No toys: show what would be sent, so the strip is never dead.
    f.out.forEach((v, m) => {
      const key = `out:${m}`;
      if (!traces.has(key)) traces.set(key, []);
      const arr = traces.get(key);
      arr.push(v);
      if (arr.length > HISTORY) arr.shift();
    });
    tensionHist.push(f.tension);
    if (tensionHist.length > HISTORY) tensionHist.shift();
    const pct = Math.round(f.tension * 100);
    $("#tension-val").textContent = pct;
    $("#heart-fill").setAttribute("y", String(28 - 28 * f.tension));
  }

  const canvas = $("#scope");
  const ctx = canvas.getContext("2d");
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 14;
    const x = (i, len) => w - ((len - 1 - i) / (HISTORY - 1)) * w;
    const y = (v) => h - pad - v * (h - pad * 2);

    // Event marks: a pencil tick and its glyph, scrolling with the traces.
    const now = Date.now(), span = HISTORY * 100;
    marks = marks.filter((m) => now - m.at < span);
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const m of marks) {
      const mx = w - ((now - m.at) / span) * w;
      ctx.strokeStyle = "#2b1d1433";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, 26);
      ctx.lineTo(mx, h);
      ctx.stroke();
      ctx.fillText(GLYPH[m.type] || "•", mx, 20);
    }

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "#2b1d1455";
    ctx.lineWidth = 2;
    line(tensionHist, x, y);
    ctx.setLineDash([]);

    ctx.lineWidth = 3.5;
    ctx.lineJoin = ctx.lineCap = "round";
    traceKeys().forEach(({ key }, i) => {
      ctx.strokeStyle = INK[i % INK.length];
      line(traces.get(key) || [], x, y);
    });
    requestAnimationFrame(draw);
  }
  function line(arr, x, y) {
    if (arr.length < 2) return;
    ctx.beginPath();
    arr.forEach((v, i) => (i ? ctx.lineTo(x(i, arr.length), y(v)) : ctx.moveTo(x(i, arr.length), y(v))));
    ctx.stroke();
  }

  connect();
  requestAnimationFrame(draw);
})();
