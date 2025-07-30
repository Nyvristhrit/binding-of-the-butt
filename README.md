# Binding of the Butt

Ce document décrit les étapes nécessaires à l’installation et à la configuration du mod **Binding of the Butt** (compatible Repentance v1.7.9 / Repentance+). Suivez attentivement chaque section pour un déploiement propre et professionnel.

---

## 📋 Prérequis

1. **Binding of Isaac: Repentance** (ou version supérieure) installé via Steam.
2. **Repentance+** activé pour la prise en charge de LuaSocket.
3. **Node.js** (v14+) installé sur votre machine pour exécuter le compagnon JavaScript.
4. **Buttplug Server** (Intiface ou équivalent) en fonctionnement sur `ws://localhost:12345`.
5. **Accès à un terminal** (cmd, PowerShell ou Bash sous Windows).

---

## 🗂️ Structure du ZIP fourni

Le fichier ZIP contient :

- `install.bat` : script d’installation automatique pour Windows.
- `companion.exe` : version packagée de `companion.js` (Node.js intégré).
- Dossier `mod/` : contient `main.lua`, `metadata.xml` et la structure du mod.
- Dossier `config/` : contient `config.json` pour les paramètres de vibration.

---

## ⚙️ Installation

### 1. Téléchargement

1. Téléchargez le ZIP du mod depuis le dépôt officiel ou le site fourni.
2. Placez le ZIP dans un dossier de votre choix.

### 2. Décompression et installation

1. Ouvrez un terminal dans le dossier contenant le ZIP.
2. Lancez :
   ```bat
   install.bat
   ```
   - Cette commande décompresse les fichiers et copie le dossier `binding of the butt` dans :
     - `%USERPROFILE%\Documents\My Games\Binding of Isaac Repentance\mods`
     - `%USERPROFILE%\Documents\My Games\Binding of Isaac Repentance+\mods`
   - Elle crée également un raccourci `companion.exe` dans le même dossier.

---

## 🚀 Configuration Steam

Pour activer le débogage Lua et voir les logs du mod :

1. Ouvrez **Steam**.
2. Dans votre bibliothèque, faites un clic droit sur **Binding of Isaac: Repentance**.
3. Sélectionnez **Propriétés...**.
4. Dans **Options de lancement**, ajoutez :
   ```text
   --luadebug
   ```
5. Fermez la fenêtre des propriétés.

---

## ▶️ Lancement du mod

1. Assurez-vous que votre **Buttplug Server** (Intiface) est en cours d’exécution et accessible sur `ws://localhost:12345`.
2. Démarrez le compagnon :
   - Double-cliquez sur `companion.exe` ou, en ligne de commande :
     ```bat
     companion.exe
     ```
3. Lancez **Binding of Isaac: Repentance** depuis Steam.
4. Vérifiez dans la console du jeu (touche `~`) que vous voyez :
   ```text
   [Butt] Socket connecté !
   [Binding of the Butt] Mod chargé !
   ```
   Cela confirme la connexion entre le jeu et le compagnon.

---

## 🔧 Personnalisation

- **config.json** : Ajustez les valeurs suivantes selon vos préférences :
  - `INTENSITY_BASE` : intensité de base des vibrations.
  - `DECAY_RATE` : vitesse de retour à l’intensité de base.
  - `EVENT_BOOSTS` : boost d’intensité par événement (HURT, BOSS\_DEAD, etc.).
  - `HEART_LOW` : paramètres de la boucle en cas de vie basse (`intensity`, `duration`, `interval`).

Le fichier est rechargé automatiquement à chaque modification.

---

## 🐛 Dépannage

- **Pas de vibrations ?**
  - Vérifiez que votre serveur Buttplug/Intiface est actif.
  - Assurez-vous que le compagnon est connecté :
    ```text
    ✅  Connecté à Intiface – <nom du serveur>
    🕹️  Mod BoI connecté
    ```
- **Logs absent dans le jeu ?**
  - Confirmez l’option `--luadebug` dans Steam.
  - Ouvrez la console Lua (`~`) et recherchez les messages `[Butt]`.
- **Erreurs Node.js ?**
  - Installez les dépendances (si usage de `companion.js`) :
    ```bash
    cd path/to/companion
    npm install
    npm start
    ```

---

## 📄 Licence

Ce mod est distribué sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

---

*Dernière mise à jour : 30 juillet 2025*

