// ========== FICHIER : companion.js ==========
const fs   = require("fs");
const net  = require("net");
const { ButtplugClient,
        ButtplugNodeWebsocketClientConnector } = require("buttplug");

const GAME_PORT = 58711;
const BPC_URL = "ws://127.0.0.1:12345";
const CONFIG_FN = "config.json";

let CONF = {};
let EVENT_BOOSTS = {};
let INTENSITY_BASE = 0.05;
let DECAY_RATE = 0.005;

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FN, "utf8")
                  .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    CONF = JSON.parse(raw);
    EVENT_BOOSTS = CONF.EVENT_BOOSTS || {};
    INTENSITY_BASE = CONF.INTENSITY_BASE ?? 0.05;
    DECAY_RATE = CONF.DECAY_RATE ?? 0.005;
    console.log("🔄  Config rechargée :", CONFIG_FN);
  } catch (e) {
    console.error("⚠️  Erreur lecture config :", e.message);
  }
}
loadConfig();
fs.watchFile(CONFIG_FN, { interval: 1000 }, loadConfig);

let currentIntensity = INTENSITY_BASE;
let targetIntensity = INTENSITY_BASE;
let loops = {};
let modConnected = false;
let socketConnected = false;
let gameBaseIntensity = 0; // Intensité de base pour la partie en cours

let globalDevices = [];

setInterval(() => {
  if (!modConnected) return;

  const baseLevel = gameBaseIntensity > 0 ? gameBaseIntensity : INTENSITY_BASE;
  
  if (targetIntensity > baseLevel) {
    targetIntensity = Math.max(baseLevel, targetIntensity - DECAY_RATE);
  } else if (targetIntensity < baseLevel) {
    targetIntensity = Math.min(baseLevel, targetIntensity + DECAY_RATE);
  }
  currentIntensity = targetIntensity;

  for (const d of globalDevices) {
    try {
      if (d.vibrateAttributes && d.vibrateAttributes.length > 0) {
        d.vibrate(currentIntensity);
      }
    } catch (error) {
      console.error("⚠️  Erreur vibration:", error.message);
    }
  }
}, 100);

(async () => {
  try {
    const bp = new ButtplugClient("BindingOfTheButt");
    console.log("🔌  Tentative de connexion à Intiface sur", BPC_URL);
    await bp.connect(new ButtplugNodeWebsocketClientConnector(BPC_URL));
    console.log("✅  Connecté à Intiface –", bp.serverName || "Serveur Buttplug");
    await bp.startScanning();
    console.log("🔍  Scan des appareils démarré");
    globalDevices = bp.devices;
    console.log("📱  Appareils détectés:", globalDevices.length);

  bp.on("deviceadded", device => {
    console.log("➕ Nouveau jouet détecté :", device.name);
    console.log("   Fonctions disponibles:", device.vibrateAttributes ? device.vibrateAttributes.length : "Non défini");
    globalDevices = bp.devices;
    console.log("📱  Total d'appareils:", globalDevices.length);
  });

  bp.on("deviceremoved", device => {
    console.log("➖ Jouet retiré :", device.name);
    globalDevices = bp.devices;
    console.log("📱  Total d'appareils:", globalDevices.length);
  });

  const server = net.createServer(socket => {
    console.log("🕹️  Mod BoI connecté");
    socketConnected = true;

    socket.on("data", async chunk => {
      const lines = chunk.toString().trim().split("\n");
      for (const line of lines) {
        let ev; try { ev = JSON.parse(line); } catch { continue; }

        if (ev.type === "HELLO") {
          modConnected = true;
          targetIntensity = 0;
          currentIntensity = 0;
          console.log("🤝  Mod connecté – en attente du démarrage de partie");
          continue;
        }

        handleEvent(ev);
      }
    });

    socket.on("close", () => {
      console.log("🚪  Déconnexion du mod (reset ou retour menu)");
      modConnected = false;
      socketConnected = false;
      gameBaseIntensity = 0;
      targetIntensity = INTENSITY_BASE;
      currentIntensity = INTENSITY_BASE;
      for (const key in loops) {
        clearInterval(loops[key]);
        loops[key] = null;
      }
      globalDevices.forEach(d => d.stop());
    });
  });

  server.listen(GAME_PORT, "127.0.0.1",
    () => console.log("⌛  En attente de Binding of Isaac sur", GAME_PORT));

  } catch (error) {
    console.error("❌  Erreur de connexion à Intiface:", error.message);
    console.error("💡  Vérifiez que:");
    console.error("   - Intiface Central est démarré");
    console.error("   - Le serveur écoute sur ws://127.0.0.1:12345");
    console.error("   - Aucun firewall ne bloque la connexion");
    process.exit(1);
  }
})();

function handleEvent(ev) {
  // 🔁 RESET → on arrête tout et on passe en offline
  if (ev.type === "RESET") {
    console.log("🔁  RESET reçu → réinitialisation complète");
    modConnected = false;                  // stoppe la boucle de base
    targetIntensity = INTENSITY_BASE;
    currentIntensity = INTENSITY_BASE;
    // arrête toutes les boucles de type HEART_LOW, etc.
    for (const key in loops) {
      clearInterval(loops[key]);
      loops[key] = null;
    }
    // arrête les vibrations
    globalDevices.forEach(d => d.stop());
    return;
  }

  if (ev.type === "HEART_LOW") {
    const cfg = CONF["HEART_LOW"];
    if (!cfg) return;
    if (ev.state === "start") {
      if (loops.HEART_LOW) return;
      console.log("❤️  DANGER loop started");
      loops.HEART_LOW = setInterval(async () => {
        for (const d of globalDevices) {
          try {
            if (d.vibrateAttributes && d.vibrateAttributes.length > 0) {
              await d.vibrate(cfg.intensity);
            }
          } catch (error) {
            console.error("⚠️  Erreur HEART_LOW vibration:", error.message);
          }
        }
        setTimeout(() => {
          globalDevices.forEach(d => {
            try {
              d.stop();
            } catch (error) {
              console.error("⚠️  Erreur stop vibration:", error.message);
            }
          });
        }, cfg.duration * 1000);
      }, cfg.interval * 1000);
    } else if (ev.state === "stop") {
      console.log("💤  DANGER loop stopped");
      clearInterval(loops.HEART_LOW);
      loops.HEART_LOW = null;
      globalDevices.forEach(d => d.stop());
    }
    return;
  }

  // Gestion spéciale pour GAME_START qui active la vibration de base
  if (ev.type === "GAME_START") {
    const baseIntensity = EVENT_BOOSTS["GAME_START"];
    if (typeof baseIntensity === "number") {
      gameBaseIntensity = baseIntensity;
      targetIntensity = baseIntensity;
      currentIntensity = baseIntensity;
      console.log(`🎮  Partie démarrée → vibration de base activée (${Math.round(baseIntensity * 100)}%)`);
    }
    return;
  }

  const boost = EVENT_BOOSTS[ev.type];
  if (typeof boost === "number") {
    targetIntensity = Math.min(1.0, targetIntensity + boost);
    console.log(`⚡  ${ev.type} boost → +${Math.round(boost * 100)}% (target ${Math.round(targetIntensity * 100)}%)`);
  } else {
    console.log(`ℹ️  ${ev.type} ignoré (pas de boost défini)`);
  }
}
