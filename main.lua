-- main.lua ─ Binding of the Butt
-- Compatible Repentance v1.7.9 / Repentance+
-- Auteur : Gizmo / ChatGPT (v2 – sans HEART_PICKUP)

--------------------------------------------------
-- 0.  Déclarations de base
--------------------------------------------------
local ButtMod = RegisterMod("Binding of the Butt", 1)

-- LuaSocket est fourni par Repentance+
local socket = require("socket")
local HOST, PORT = "127.0.0.1", 58711
local client -- handle TCP non‑bloquant

--------------------------------------------------
-- 1.  Connexion au companion NodeJS
--------------------------------------------------
local function Connect()
  if client then pcall(function() client:close() end) end
  client = socket.tcp()
  client:settimeout(0)
  local ok, err = client:connect(HOST, PORT)
  if not ok and err ~= "timeout" then
    Isaac.ConsoleOutput("[Butt] Connexion échouée : " .. tostring(err) .. "\n")
    client = nil
  else
    Isaac.ConsoleOutput("[Butt] Socket connecté !\n")
    client:send('{"type":"HELLO"}\n')
  end
end

--------------------------------------------------
-- 2.  Démarrage / Continues de partie
--------------------------------------------------
function ButtMod:OnGameStart(isContinued)
  Connect()
end
ButtMod:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, ButtMod.OnGameStart)

--------------------------------------------------
-- 3.  Dégâts reçus par le joueur → HURT
--------------------------------------------------
function ButtMod:OnPlayerHurt(ent, dmg, flags, src, cd)
  if ent.Type == EntityType.ENTITY_PLAYER and client then
    if client:send(string.format('{"type":"HURT","value":%d}\n', dmg)) then
      Isaac.ConsoleOutput("[Butt] HURT envoyé (" .. dmg .. ")\n")
    end
  end
end
ButtMod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, ButtMod.OnPlayerHurt)

--------------------------------------------------
-- 4.  Boss tué → BOSS_DEAD
--------------------------------------------------
function ButtMod:OnBossDeath(npc)
  if npc:IsBoss() and client then
    client:send('{"type":"BOSS_DEAD"}\n')
    Isaac.ConsoleOutput("[Butt] BOSS_DEAD envoyé\n")
  end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_NPC_DEATH, ButtMod.OnBossDeath)

--------------------------------------------------
-- 5.  Ennemis normaux tués → ENEMY_DEAD
--------------------------------------------------
function ButtMod:OnEnemyDeath(npc)
  if not npc:IsBoss() and client then
    client:send('{"type":"ENEMY_DEAD"}\n')
  end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_NPC_DEATH, ButtMod.OnEnemyDeath)

--------------------------------------------------
-- 6.  Apparition d’un objet rare (Qualité ≥ 3) → ITEM_RARE
--------------------------------------------------
function ButtMod:OnCollectibleInit(pickup)
  if pickup.Variant ~= PickupVariant.PICKUP_COLLECTIBLE then return end
  local cfg = Isaac.GetItemConfig():GetCollectible(pickup.SubType)
  if cfg and cfg.Quality >= 3 and client then
    client:send(string.format('{"type":"ITEM_RARE","quality":%d}\n', cfg.Quality))
    Isaac.ConsoleOutput("[Butt] ITEM_RARE envoyé (Q=" .. cfg.Quality .. ")\n")
  end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_PICKUP_INIT, ButtMod.OnCollectibleInit, PickupVariant.PICKUP_COLLECTIBLE)

--------------------------------------------------
-- 7.  Vie basse (≤ 1 cœur rouge) → HEART_LOW start/stop
--------------------------------------------------
local dangerState = false
function ButtMod:OnUpdate()
  if not client then return end
  local player = Isaac.GetPlayer(0)
  local totalHearts = player:GetHearts() + player:GetSoulHearts()

  if totalHearts <= 2 and not dangerState then
    client:send('{"type":"HEART_LOW","state":"start"}\n')
    dangerState = true
  elseif totalHearts > 2 and dangerState then
    client:send('{"type":"HEART_LOW","state":"stop"}\n')
    dangerState = false
  end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_UPDATE, ButtMod.OnUpdate)

--------------------------------------------------
-- 8.  Fin de partie / reset / retour menu → RESET
--------------------------------------------------
local function SendReset()
  if client then
    client:send('{"type":"RESET"}\n')
    Isaac.ConsoleOutput("[Butt] RESET envoyé\n")
  end
end
function ButtMod:OnGameExit()  SendReset() end
function ButtMod:OnGameEnded() SendReset() end
ButtMod:AddCallback(ModCallbacks.MC_PRE_GAME_EXIT,   ButtMod.OnGameExit)
ButtMod:AddCallback(ModCallbacks.MC_POST_GAME_ENDED, ButtMod.OnGameEnded)

--------------------------------------------------
-- 9.  Log de chargement
--------------------------------------------------
Isaac.DebugString("[Binding of the Butt] Mod chargé ! (v2 sans HEART_PICKUP)")
