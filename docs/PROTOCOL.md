# Mod ↔ companion protocol (v2)

TCP on `127.0.0.1:58711`, one JSON object per line (`\n`). The companion is the server; the mod reconnects on its own.

## Mod → companion

| Message | When | Fields |
|---|---|---|
| `{"t":"hello","v":2,"mod":"1.0.0"}` | right after connecting | protocol and mod version |
| `{"t":"state", …}` | ~3×/s during a run (doubles as heartbeat) | see below |
| `{"t":"ev","e":"<EVENT>", …}` | on game events | see below |
| `{"t":"panic"}` | F8 pressed | toggles mute |

`state` fields: `run` (bool), `paused` (bool), `stage` (int), `progress` (0–1, share of normal rooms cleared on the floor), `room` (`normal`, `boss`, `miniboss`, `devil`, `angel`, `treasure`, `shop`, `challenge`, `bossrush`, `secret`), `clear` (bool), `threat` (0–1, remaining enemy HP relative to the room's peak), `hp` (lowest player health in half hearts), `lowHpImmune` (bool, e.g. The Lost).

Events: `GAME_START`, `EXIT`, `DEATH`, `WIN`, `NEW_FLOOR` (`stage`), `DEVIL_ROOM`, `ANGEL_ROOM`, `ROOM_CLEAR`, `BOSS_DEFEATED`, `BOMB` (`n` explosions in the same frame), `HURT` (`dmg`), `KILL` (`boss`), `ITEM` (`q` quality 0–4, `id`), `ACTIVE_ITEM`, `CARD`, `PILL`.

If no message arrives for 3 s the companion treats the game as gone and stops the toys.

## Companion → mod

`{"t":"status","intiface":true,"toys":2,"muted":false}` on changes; the mod shows it in a small HUD line.

## Control panel

`http://127.0.0.1:7878`, WebSocket at `/ws`. Server pushes `hello`, `frame` (10 Hz), `event`, `devices`, `game`, `settings`. Client sends `setSettings {patch}`, `resetSettings`, `device {key, patch}`, `mute {value}`, `preview {event}`, `scan`.
