# Binding of the Butt

A mod for **The Binding of Isaac: Repentance / Repentance+** that makes your connected toys react to the game, through [Intiface Central](https://intiface.com/central/) (Buttplug). Works with anything Intiface supports (Lovense and many others), several toys at once, each motor driven separately.

- **Ambient tension** that builds up through each floor, rises in fights and boss rooms, and calms down in cleared rooms. Each new floor starts a bit hotter.
- **Patterns for game events**: bombs send shockwaves (chain them for bigger waves), hits jolt then cut, bosses end in a crescendo, items sweep higher the better they are, a heartbeat kicks in at low health, and more.
- **Control panel** in your browser: live view of every motor, event feed, intensity cap, per-event strength and on/off, per-toy scale, a test button for every pattern. English and French.
- **Safety**: pausing the game pauses the toys, `F8` in game (or *Stop all* in the panel) stops everything, and toys stop if the game freezes or closes.

## Install

1. Download the latest release zip and extract it.
2. Copy the `binding of the butt` folder into Isaac's mod folder, usually  
   `C:\Program Files (x86)\Steam\steamapps\common\The Binding of Isaac Rebirth\mods\`  
   (or run `install.bat`, which looks for it).
3. In Steam: right-click the game → *Properties* → *Launch options* → add `--luadebug`.  
   This lets the mod open a local connection to the companion. Note that it also gives every mod you have installed access to your files, so only use mods you trust.
4. Install [Intiface Central](https://intiface.com/central/).

## Play

1. Start Intiface Central, press *Start Server*, connect your toys.
2. Start `companion.exe`. The control panel opens in your browser.
3. Launch Isaac and start a run. A small line at the bottom-left confirms the connection.

## Develop

```bash
cd companion
npm install
npm start            # run from source
npm test             # engine and protocol tests
npm run build        # dist/companion.exe
node ../tools/fake-isaac.js tour   # simulate a run without the game
```

`tools/release.js` builds the release zip. The mod ↔ companion protocol is described in [docs/PROTOCOL.md](docs/PROTOCOL.md).

Layout: `mod/` (Lua, runs in Isaac), `companion/src/` (engine, devices, game link, web server), `companion/web/` (control panel).

## License

MIT
