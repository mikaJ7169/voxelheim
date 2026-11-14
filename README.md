# Voxelheim 2 — Les Chroniques de l'Éveil

Jeu voxel d'aventure et de construction, 100% web (three.js via CDN), **installable comme application Android** (PWA).

## Lore
Le Cœur d'Aethérium est brisé. Dernier Éveillé, explore les biomes, fouille les ruines des Anciens, collecte les 8 Chroniques dans leurs Caches, et offre 8 Éclats d'Aethérium à un Autel pour faire renaître le Cœur.

## Contrôles tactiles (Android/tablette)
- Zone gauche de l'écran : joystick dynamique (se déplacer)
- Glisser à droite : caméra · tap court : poser · appui long : casser
- Boutons : ⛏ casser · ▣ poser/utiliser · ⤒ sauter · 🎒 sac · 🍖 manger · 📜 chroniques · 💾 sauvegarder
- Toucher un slot de la barre : sélection de l'objet

## Contrôles clavier
ZQSD/WASD · Espace · Shift sprint · clic gauche casser · clic droit poser/utiliser · molette/1-9 sélection · E sac · L chroniques · F manger

## Installation comme app (Android)
1. Activer GitHub Pages : Settings → Pages → branche `main` / (root)
2. Ouvrir le site dans Chrome → menu ⋮ → **« Installer l'application »**
3. Le jeu s'installe avec son icône, plein écran, et fonctionne **hors-ligne** (service worker)

## Contenu
- 4 biomes : Plaines de Velours, Forêt de Sylve, Dunes d'Étoile, Pics d'Ancre (+ l'Abîme du Vide en profondeur)
- 22 blocs, 17 outils, ~30 recettes, 6 consommables originaux
- Ruines des Anciens avec Caches à Chroniques, autels, quête finale du Cœur d'Aethérium
- **Sauvegarde automatique du monde** (blocs modifiés, inventaire, position, chroniques)
- Cycle jour/nuit, faim, vie, dégâts de chute, régénération du Cœur
- Qualité adaptative tablette : chunks progressifs, rendu allégé

## Fichiers
- `index.html` — interface · `engine.js` — moteur · `content.js` — contenu/lore
- `manifest.json`, `sw.js`, `icon.svg` — installation PWA
