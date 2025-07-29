# Binding of the Butt

A mod for **The Binding of Isaac: Repentance+** that links in-game events to [Buttplug.io](https://buttplug.io)-compatible toys via Intiface Central.

> Getting hit in Isaac has never been this... *stimulating* 😏

## 🔧 Features

- Vibrates on rare item spawn (Quality 3+)
- Reactions to damage taken, enemy and boss deaths
- Heart-low looping effect when at low health
- Local socket connection (`127.0.0.1:58711`) to the companion

## 📁 Repository Contents

- `main.lua` – The core Isaac mod
- `metadata.xml` – Mod metadata
- `companion/` – NodeJS companion client
  - `companion.js` – Connects to Buttplug/Intiface
  - `config.json` – Event configuration
  - `package.json` – Node dependencies

## 🚀 Installation

1. Copy the `binding-of-the-butt` folder to:
   ```
   Documents/My Games/Binding of Isaac Repentance/mods/
   or
   SteamLibrary/steamapps/common/The Binding of Isaac Rebirth/mods/

2. Install and run [Intiface Central](https://intiface.com/)

3. In the `companion/` folder, open a terminal and run:
   ```bash
   npm install
   npm start
   ```

4. Launch the game with the mod enabled

5. Enjoy the ride 😈

## 🛠 Requirements

- Node.js
- [`buttplug`](https://www.npmjs.com/package/buttplug) (installed via `npm`)
- Intiface Central running on `ws://localhost:12345`

## ❤️ Credits

Created by **Nyvee**, with technical support from ChatGPT.
