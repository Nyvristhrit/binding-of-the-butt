-- Binding of the Butt - Mod principal avec gestion d'erreurs robuste
local ButtMod = RegisterMod("Binding of the Butt", 1)
local socket = require("socket")
local json = require("json")

local HOST, PORT = "127.0.0.1", 58711
local client = nil
local connected = false
local reconnectTimer = 0
local RECONNECT_DELAY = 300 -- 10 secondes à 30 FPS
local gameStartTimer = 0
local gameStartSent = false

print("[ButtMod] ============================================")
print("[ButtMod] BINDING OF THE BUTT - DÉMARRAGE")
print("[ButtMod] ============================================")

-- Fonction de connexion sécurisée
local function Connect()
    local success, err = pcall(function()
        if client then
            pcall(function() client:close() end)
            client = nil
        end
        
        print("[ButtMod] Tentative de connexion au companion...")
        client = socket.tcp()
        
        if not client then
            error("Impossible de créer le socket TCP")
        end
        
        client:settimeout(0.1) -- Non-bloquant
        local ok, connectErr = client:connect(HOST, PORT)
        
        if not ok then
            if connectErr ~= "timeout" then
                error("Connexion échouée: " .. tostring(connectErr))
            end
            client:close()
            client = nil
            return false
        end
        
        print("[ButtMod] ✅ Connecté au companion !")
        
        -- Envoi du message HELLO
        local helloMsg = json.encode({type = "HELLO", source = "isaac"}) .. "\n"
        local sendOk, sendErr = client:send(helloMsg)
        
        if not sendOk then
            error("Erreur envoi HELLO: " .. tostring(sendErr))
        end
        
        print("[ButtMod] Message HELLO envoyé")
        connected = true
        return true
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur de connexion: " .. tostring(err))
        connected = false
        if client then
            pcall(function() client:close() end)
            client = nil
        end
        return false
    end
    
    return success
end

-- Fonction d'envoi sécurisée
local function SafeSend(message)
    if not connected or not client then
        return false
    end
    
    local success, err = pcall(function()
        local jsonMsg = json.encode(message) .. "\n"
        local ok, sendErr = client:send(jsonMsg)
        if not ok then
            error("Erreur d'envoi: " .. tostring(sendErr))
        end
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur envoi message: " .. tostring(err))
        connected = false
        return false
    end
    
    return true
end

-- Fonction de reset sécurisée
local function SendReset()
    local success, err = pcall(function()
        if connected and client then
            SafeSend({type = "STOP"})
            print("[ButtMod] Signal STOP envoyé")
        end
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur SendReset: " .. tostring(err))
    end
end

-- Callback: Démarrage du jeu
function ButtMod:OnGameStart(isContinued)
    local success, err = pcall(function()
        print("[ButtMod] Jeu démarré (continued: " .. tostring(isContinued) .. ")")
        Connect()
        gameStartTimer = 30 -- 1 seconde de délai
        gameStartSent = false
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur OnGameStart: " .. tostring(err))
    end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, ButtMod.OnGameStart)

-- Callback: Mise à jour (gestion reconnexion + santé faible)
function ButtMod:OnUpdate()
    local success, err = pcall(function()
        -- Gestion de la reconnexion
        if not connected then
            reconnectTimer = reconnectTimer + 1
            if reconnectTimer >= RECONNECT_DELAY then
                reconnectTimer = 0
                Connect()
            end
            return
        end
        
        -- Gestion de l'envoi de GAME_START après connexion
        if gameStartTimer > 0 and not gameStartSent then
            gameStartTimer = gameStartTimer - 1
            if gameStartTimer <= 0 and connected and client then
                SafeSend({
                    type = "GAME_START",
                    continued = false
                })
                print("[ButtMod] Événement GAME_START envoyé")
                gameStartSent = true
            end
        end
        
        -- Vérification santé faible
        local player = Isaac.GetPlayer(0)
        if not player then
            return
        end
        
        local hearts = player:GetHearts() + player:GetSoulHearts()
        if hearts <= 2 then -- 1 cœur ou moins
            SafeSend({type = "HEART_LOW", hearts = hearts})
        end
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur OnUpdate: " .. tostring(err))
    end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_UPDATE, ButtMod.OnUpdate)

-- Callback: Collectible ramassé
function ButtMod:OnCollectibleInit(pickup)
    local success, err = pcall(function()
        if not pickup then
            return
        end
        
        local itemConfig = Isaac.GetItemConfig()
        if not itemConfig then
            return
        end
        
        local cfg = itemConfig:GetCollectible(pickup.SubType)
        if not cfg or not cfg.Quality then
            return
        end
        
        if cfg.Quality >= 3 then -- Qualité 3 ou 4
            SafeSend({
                type = "ITEM_QUALITY",
                quality = cfg.Quality,
                name = cfg.Name or "Unknown"
            })
            print("[ButtMod] Item qualité " .. cfg.Quality .. " détecté: " .. (cfg.Name or "Unknown"))
        end
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur OnCollectibleInit: " .. tostring(err))
    end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_PICKUP_INIT, ButtMod.OnCollectibleInit, PickupVariant.PICKUP_COLLECTIBLE)

-- Callback: Joueur blessé
function ButtMod:OnPlayerHurt(ent, amount, flags, source, countdown)
    local success, err = pcall(function()
        if not ent or not connected or not client then
            return
        end
        
        SafeSend({
            type = "PLAYER_HURT",
            damage = amount or 1,
            source = source and source.Type or "unknown"
        })
        print("[ButtMod] Joueur blessé - dégâts: " .. (amount or 1))
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur OnPlayerHurt: " .. tostring(err))
    end
end
ButtMod:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, ButtMod.OnPlayerHurt, EntityType.ENTITY_PLAYER)

-- Callback: Mort d'un NPC (boss ou ennemi)
function ButtMod:OnNPCDeath(npc)
    local success, err = pcall(function()
        if not npc or not connected or not client then
            return
        end
        
        -- Vérifier si c'est un boss
        if npc:IsBoss() then
            SafeSend({
                type = "BOSS_DEATH",
                boss = npc.Type or "unknown"
            })
            print("[ButtMod] Boss vaincu: " .. (npc.Type or "unknown"))
        else
            -- Ennemis spéciaux (plus gros boost)
            if npc.Type == EntityType.ENTITY_MONSTRO or 
               npc.Type == EntityType.ENTITY_LARRY_JR or
               npc.Type == EntityType.ENTITY_CHUB then
                SafeSend({
                    type = "SPECIAL_ENEMY_DEATH",
                    enemy = npc.Type
                })
                print("[ButtMod] Ennemi spécial vaincu: " .. npc.Type)
            else
                -- Ennemi normal (petit boost)
                SafeSend({
                    type = "ENEMY_DEATH",
                    enemy = npc.Type or "unknown"
                })
                -- Pas de log pour éviter le spam
            end
        end
    end)
    
    if not success then
        print("[ButtMod] ❌ Erreur OnNPCDeath: " .. tostring(err))
    end
end
ButtMod:AddCallback(ModCallbacks.MC_POST_NPC_DEATH, ButtMod.OnNPCDeath)

-- Callback: Sortie du jeu
function ButtMod:OnExit()
    print("[ButtMod] Sortie du jeu - nettoyage...")
    SendReset()
    if client then
        pcall(function() client:close() end)
        client = nil
    end
    connected = false
end
ButtMod:AddCallback(ModCallbacks.MC_PRE_GAME_EXIT, ButtMod.OnExit)

print("[ButtMod] Mod initialisé - en attente de connexion au companion")
print("[ButtMod] Assurez-vous que companion.js est démarré !")

-- Tentative de connexion initiale
Connect()