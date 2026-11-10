-- Binding of the Butt: streams game state and events to the local companion.
-- Requires the --luadebug launch option (LuaSocket). Protocol: docs/PROTOCOL.md

local mod = RegisterMod("Binding of the Butt", 1)
local json = require("json")
local VERSION = "1.0.0"
local HOST, PORT = "127.0.0.1", 58711
local PANIC_KEY = Keyboard.KEY_F8

local ok, socket = pcall(require, "socket")
if not ok then
  socket = nil
  print("[BoB] LuaSocket unavailable: add --luadebug to the Steam launch options")
end

---------------------------------------------------------------- connection

local net = {
  client = nil,
  status = "offline", -- offline | connecting | online
  since = 0, -- frame of last status change
  retryAt = 0,
  rx = "",
  tx = "",
  remote = {}, -- last status sent by the companion
}
local frame = 0

local function setStatus(s)
  net.status, net.since = s, frame
end

local function disconnect()
  if net.client then pcall(function() net.client:close() end) end
  net.client, net.rx, net.tx = nil, "", ""
  net.remote = {}
  net.retryAt = frame + 180 -- ~3 s at 60 fps
  setStatus("offline")
end

local function send(msg)
  if net.status == "online" then net.tx = net.tx .. json.encode(msg) .. "\n" end
end

local function onMessage(msg)
  if msg.t == "status" then net.remote = msg end
end

-- Non-blocking: connect() returns immediately; select() tells us when it is done.
local function pump()
  if not socket then return end
  if net.status == "offline" then
    if frame < net.retryAt then return end
    net.client = socket.tcp()
    net.client:settimeout(0)
    local res, err = net.client:connect(HOST, PORT)
    if res or err == "timeout" or err == "Operation already in progress" then
      setStatus("connecting")
    else
      disconnect()
    end
    return
  end

  if net.status == "connecting" then
    local _, writable = socket.select(nil, { net.client }, 0)
    if writable and #writable > 0 and net.client:getpeername() then
      setStatus("online")
      send({ t = "hello", v = 2, mod = VERSION })
    elseif frame - net.since > 60 then
      disconnect()
    end
    return
  end

  if #net.tx > 0 then
    local sent, err, partial = net.client:send(net.tx)
    local n = sent or partial or 0
    net.tx = net.tx:sub(n + 1)
    if err == "closed" then return disconnect() end
    if #net.tx > 65536 then net.tx = "" end -- companion stalled, drop backlog
  end

  while true do
    local line, err, partial = net.client:receive("*l")
    if line then
      local okDecode, msg = pcall(json.decode, net.rx .. line)
      net.rx = ""
      if okDecode and type(msg) == "table" then onMessage(msg) end
    else
      if partial and #partial > 0 then net.rx = net.rx .. partial end
      if err == "closed" then disconnect() end
      break
    end
  end
end

---------------------------------------------------------------- game state

local game = Game()
local run = { active = false, roomPeak = 0, roomWasClear = true, queued = {} }

local ROOM_NAMES = {
  [RoomType.ROOM_BOSS] = "boss",
  [RoomType.ROOM_MINIBOSS] = "miniboss",
  [RoomType.ROOM_DEVIL] = "devil",
  [RoomType.ROOM_ANGEL] = "angel",
  [RoomType.ROOM_TREASURE] = "treasure",
  [RoomType.ROOM_SHOP] = "shop",
  [RoomType.ROOM_CHALLENGE] = "challenge",
  [RoomType.ROOM_BOSSRUSH] = "bossrush",
  [RoomType.ROOM_SECRET] = "secret",
}

local IMMUNE = {
  [PlayerType.PLAYER_THELOST] = true,
  [PlayerType.PLAYER_THELOST_B] = true,
}

local function ev(name, extra)
  local msg = extra or {}
  msg.t, msg.e = "ev", name
  send(msg)
end

local function forEachPlayer(fn)
  for i = 0, game:GetNumPlayers() - 1 do
    local p = Isaac.GetPlayer(i)
    if p and not (p.IsCoopGhost and p:IsCoopGhost()) then fn(p, i) end
  end
end

-- Lowest health among players, in half hearts.
local function health()
  local lowest, immune = math.huge, false
  forEachPlayer(function(p)
    if IMMUNE[p:GetPlayerType()] then
      immune = true
    else
      local hp = p:GetHearts() + p:GetSoulHearts() + p:GetEternalHearts()
      if hp < lowest then lowest = hp end
    end
  end)
  if lowest == math.huge then lowest = 0 end
  return lowest, immune and lowest == 0
end

-- Remaining enemy health relative to the room's peak, so splitting enemies don't spike it.
local function threat()
  local total = 0
  for _, e in ipairs(Isaac.GetRoomEntities()) do
    if e:IsActiveEnemy(false) and e:IsVulnerableEnemy() then total = total + e.HitPoints end
  end
  if total > run.roomPeak then run.roomPeak = total end
  if run.roomPeak <= 0 then return 0 end
  return total / run.roomPeak
end

local function floorProgress()
  local rooms = game:GetLevel():GetRooms()
  local total, cleared = 0, 0
  for i = 0, rooms.Size - 1 do
    local desc = rooms:Get(i)
    if desc and desc.Data and desc.Data.Type == RoomType.ROOM_DEFAULT then
      total = total + 1
      if desc.Clear then cleared = cleared + 1 end
    end
  end
  return total > 0 and cleared / total or 0
end

local function sendState()
  local room = game:GetRoom()
  local hp, immune = health()
  send({
    t = "state",
    run = run.active,
    paused = game:IsPaused(),
    stage = game:GetLevel():GetStage(),
    progress = floorProgress(),
    room = ROOM_NAMES[room:GetType()] or "normal",
    clear = room:IsClear(),
    threat = threat(),
    hp = hp,
    lowHpImmune = immune,
  })
end

---------------------------------------------------------------- callbacks

mod:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, function(_, continued)
  run.active = true
  run.queued = {}
  ev("GAME_START", { continued = continued })
end)

mod:AddCallback(ModCallbacks.MC_PRE_GAME_EXIT, function()
  run.active = false
  ev("EXIT")
  sendState()
end)

mod:AddCallback(ModCallbacks.MC_POST_GAME_END, function(_, isGameOver)
  ev(isGameOver and "DEATH" or "WIN")
end)

mod:AddCallback(ModCallbacks.MC_POST_NEW_LEVEL, function()
  if game:GetFrameCount() > 1 then ev("NEW_FLOOR", { stage = game:GetLevel():GetStage() }) end
end)

mod:AddCallback(ModCallbacks.MC_POST_NEW_ROOM, function()
  local room = game:GetRoom()
  run.roomPeak = 0
  run.roomWasClear = room:IsClear()
  local kind = ROOM_NAMES[room:GetType()]
  if kind == "devil" then ev("DEVIL_ROOM") elseif kind == "angel" then ev("ANGEL_ROOM") end
end)

mod:AddCallback(ModCallbacks.MC_POST_UPDATE, function()
  local room = game:GetRoom()
  local clear = room:IsClear()
  if clear and not run.roomWasClear then
    local t = room:GetType()
    ev((t == RoomType.ROOM_BOSS or t == RoomType.ROOM_BOSSRUSH) and "BOSS_DEFEATED" or "ROOM_CLEAR")
  end
  run.roomWasClear = clear
end)

-- An explosion effect covers every bomb type (golden, troll, Bomber Boy…).
local explosionsThisFrame = 0
mod:AddCallback(ModCallbacks.MC_POST_EFFECT_INIT, function()
  explosionsThisFrame = explosionsThisFrame + 1
end, EffectVariant.BOMB_EXPLOSION)

mod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, function(_, _, amount, flags)
  if flags & DamageFlag.DAMAGE_FAKE == 0 then ev("HURT", { dmg = amount }) end
end, EntityType.ENTITY_PLAYER)

mod:AddCallback(ModCallbacks.MC_POST_NPC_DEATH, function(_, npc)
  if npc:IsEnemy() then ev("KILL", { boss = npc:IsBoss() }) end
end)

-- Fires when the item is held overhead, i.e. actually picked up.
mod:AddCallback(ModCallbacks.MC_POST_PEFFECT_UPDATE, function(_, player)
  local key = GetPtrHash(player)
  local item = player.QueuedItem.Item
  if item and not run.queued[key] then
    run.queued[key] = true
    if item:IsCollectible() then
      ev("ITEM", { q = item.Quality or 0, id = item.ID })
    end
  elseif not item then
    run.queued[key] = nil
  end
end)

mod:AddCallback(ModCallbacks.MC_USE_ITEM, function() ev("ACTIVE_ITEM") end)
mod:AddCallback(ModCallbacks.MC_USE_CARD, function() ev("CARD") end)
mod:AddCallback(ModCallbacks.MC_USE_PILL, function() ev("PILL") end)

---------------------------------------------------------------- render: network, pause, HUD

local function hudText()
  local age = frame - net.since
  if net.remote.muted then return "BoB muted (F8)", 1, 0.4, 0.4 end
  if not socket then return "BoB: add --luadebug to launch options", 1, 0.6, 0.3 end
  if net.status ~= "online" then
    if age > 600 then return nil end
    return "BoB: companion not found", 1, 0.6, 0.3
  end
  if age < 300 then
    local toys = net.remote.toys or 0
    if net.remote.intiface == false then return "BoB: Intiface not running", 1, 0.6, 0.3 end
    return "BoB: " .. toys .. " toy" .. (toys == 1 and "" or "s"), 0.6, 1, 0.6
  end
end

mod:AddCallback(ModCallbacks.MC_POST_RENDER, function()
  frame = frame + 1

  if explosionsThisFrame > 0 then
    ev("BOMB", { n = explosionsThisFrame })
    explosionsThisFrame = 0
  end

  if Input.IsButtonTriggered(PANIC_KEY, 0) then send({ t = "panic" }) end
  if frame % 20 == 0 and run.active then sendState() end

  pump()

  local text, r, g, b = hudText()
  if text then Isaac.RenderScaledText(text, 40, 255, 0.5, 0.5, r, g, b, 0.8) end
end)

mod:AddCallback(ModCallbacks.MC_PRE_MOD_UNLOAD, function(_, unloaded)
  if unloaded == mod then disconnect() end
end)

print("[BoB] Binding of the Butt v" .. VERSION .. " loaded")
