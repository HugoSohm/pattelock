# Prompt pour Claude Code : Pattelock

Tu vas créer **Pattelock**, une petite app desktop (Windows, macOS, Linux) qui désactive temporairement certaines touches du clavier pour qu'un chat qui s'allonge dessus ne déclenche rien. Lis tout ce document avant de commencer, puis propose-moi un plan court avant d'écrire le code.

---

## 1. Stack imposée

- **Tauri 2.x, dernière version stable.** Avant d'écrire quoi que ce soit, vérifie les versions actuelles sur crates.io et npm (`tauri`, `tauri-build`, `@tauri-apps/cli`, `@tauri-apps/api` et chaque plugin) et utilise les plus récentes.
- **Interdit : toute API ou config Tauri 1.x.** Concrètement :
  - pas de `allowlist` ni de `tauri::api::*` ;
  - pas de `SystemTray` : utilise `tauri::tray::TrayIconBuilder` ;
  - pas de `@tauri-apps/api/tauri` : utilise `@tauri-apps/api/core` ;
  - un `tauri.conf.json` au schéma v2, avec des permissions déclarées dans `src-tauri/capabilities/*.json` ;
  - des plugins officiels v2 (`tauri-plugin-*` en `"2"`).

  Si un exemple trouvé en ligne utilise la syntaxe v1, ignore-le.
- Structure v2 standard : `src-tauri/src/lib.rs` contient `run()` et `main.rs` l'appelle. `[lib] crate-type = ["staticlib", "cdylib", "rlib"]`.
- Front : **Vite + TypeScript, sans framework lourd** (vanilla TS, ou Solid/Svelte si ça simplifie vraiment). Code TS strict.
- Rust edition 2021, `cargo fmt` et `cargo clippy -- -D warnings` propres.
- Plugins attendus :
  - `tauri-plugin-global-shortcut` pour le raccourci on/off ;
  - `tauri-plugin-autostart` pour le lancement au démarrage ;
  - `tauri-plugin-single-instance` ;
  - `tauri-plugin-store` pour les réglages ;
  - `tauri-plugin-log`.

  N'ajoute pas d'autres plugins sans me demander.
- Aucun appel réseau. CSP stricte. Les polices sont embarquées dans le projet, sans CDN.

Pour la structure générale du dépôt, la CI et le packaging, inspire-toi de mon projet existant **https://github.com/HugoSohm/riptune** (Tauri 2 également). Clone-le et lis-le.

---

## 2. Fonctionnalités

1. **Blocage global** de ces touches, même quand l'app n'a pas le focus :
   - F1 à F12 ;
   - Impr. écran (PrintScreen) ;
   - Arrêt défil. (ScrollLock) ;
   - Pause/Attn.

   Chaque touche est activable ou désactivable individuellement dans l'UI. Par défaut, toutes sont bloquées.
2. **Interrupteur général** : le chat dort quand la protection est active et se réveille quand elle est en pause. On clique sur le chat pour basculer.
3. **Raccourci global configurable** pour basculer on/off.
   - Défaut : `Ctrl+Alt+K` sur Windows et Linux, `Cmd+Option+K` sur macOS.
   - Bouton « Changer » : il enregistre la prochaine combinaison pressée, refuse une combinaison contenant une touche bloquable et affiche une erreur si la combinaison est déjà prise par le système.
   - Le raccourci doit fonctionner même pendant le blocage, y compris en mode « clavier entier ».
4. **Mode « Verrouiller tout le clavier »** : un bouton à part (en bas à gauche) bloque **toutes** les touches du clavier, sans sélection de touches. C'est un 3e état, en plus de « F-keys bloquées » et « pause ».
   - Les seules exceptions sont la combinaison de déverrouillage (`Ctrl+Alt+K` / `Cmd+Option+K`), et donc les modificateurs nécessaires pour la taper. La souris et le trackpad ne sont jamais bloqués.
   - On en sort en cliquant sur « Déverrouiller le clavier », en cliquant sur le chat (il se réveille et passe en pause), avec le raccourci (qui revient au mode F-keys), ou via le menu du tray.
   - **Garde-fous obligatoires** : on ne doit jamais pouvoir se retrouver enfermé dehors.
     - Le raccourci de déverrouillage est détecté **dans le hook lui-même** : quand tout est avalé, le plugin global-shortcut ne recevrait plus rien.
     - Si le hook plante ou que l'app se ferme, le blocage disparaît avec elle.
     - Le mode clavier entier n'est **jamais restauré automatiquement** au redémarrage : on repart en mode F-keys.
     - Ctrl+Alt+Suppr (Windows) et les raccourcis système non interceptables restent évidemment actifs.
   - Les touches interceptées dans ce mode alimentent aussi l'événement `key-intercepted` et le compteur.
5. **Feedback temps réel** : chaque touche interceptée est envoyée du Rust vers le front via un événement Tauri (`key-intercepted`, avec `{ key, timestamp }`, throttlé à environ 10/s max).
   - Le front n'affiche **pas** la touche interceptée et ne la fait pas flasher : l'UI reste sobre. L'événement sert au compteur et à la réaction du chat (voir Animations).
   - Il affiche un **compteur total** « 1 284 coups de patte évités », cumulé depuis l'installation, **jamais remis à zéro**, persisté dans le store et formaté à la française (espace fine pour les milliers). Le compteur est incrémenté côté Rust et écrit sur disque de façon groupée (debounce), pas à chaque touche.
6. **Icône dans la barre des tâches / barre de menus** :
   - menu « Endormir / Réveiller le chat », « Verrouiller / Déverrouiller tout le clavier », « Ouvrir », « Quitter » ;
   - l'icône change selon l'état (actif / pause) ;
   - fermer la fenêtre la cache dans le tray sans quitter, et le blocage continue.
7. **Persistance** (store) : touches sélectionnées, état on/off, raccourci, pelage du chat, accent, thème, autostart, compteur total.
8. **Instance unique** : relancer l'app ramène la fenêtre existante au premier plan.

---

## 3. Blocage des touches : implémentation par OS

Il ne suffit pas d'écouter les touches, il faut **avaler** l'événement pour qu'aucune autre app ne le reçoive. Fais ça dans un module Rust `keyguard` avec un trait commun et une implémentation par OS (`#[cfg(target_os = ...)]`). Le hook tourne sur son propre thread et l'état partagé passe par `Arc<RwLock<…>>` ou des atomics. Le hook gère 3 modes (`Off`, `FKeys(set)`, `All`). En mode `All`, il avale tout sauf la combinaison de déverrouillage, qu'il détecte lui-même en suivant l'état des modificateurs.

- **Windows** : `SetWindowsHookExW(WH_KEYBOARD_LL)` via le crate `windows` (le crate officiel Microsoft, pas `winapi`). Retourne `LRESULT(1)` pour les VK bloqués (`VK_F1..VK_F12`, `VK_SNAPSHOT`, `VK_SCROLL`, `VK_PAUSE`), sinon `CallNextHookEx`. En mode `All`, tout VK est avalé sauf la combinaison de déverrouillage. Il faut une boucle de messages sur le thread du hook.
- **macOS** : `CGEventTapCreate` (crate `core-graphics` / `core-foundation`), en tap `kCGHIDEventTap` ou `kCGSessionEventTap`, option *Default* (pas *ListenOnly*). Retourne `NULL` pour avaler.
  - Il faut la permission **Accessibilité**. Détecte-la avec `AXIsProcessTrustedWithOptions` et, si elle manque, affiche dans l'UI un écran clair avec un bouton qui ouvre `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`.
  - Gère aussi le cas où le tap est désactivé par le système (`kCGEventTapDisabledByTimeout`) en le réactivant.
  - Sur Mac, la rangée du haut envoie souvent des touches média (luminosité, son) au lieu de F1 à F12. Intercepte aussi les événements `NSSystemDefined` (type 14) correspondants quand l'option « bloquer aussi les fonctions média de la rangée du haut » est activée (activée par défaut).
  - Les claviers Mac n'ont pas Impr. écran, Arrêt défil. ni Pause : sur macOS, mappe-les sur F13/F14/F15 et adapte les libellés.
- **Linux** :
  - **X11** : `XGrabKey` sur chaque keycode bloqué (avec les combinaisons de modificateurs NumLock/CapsLock), ce qui avale la touche sans droits particuliers. En mode `All`, `XGrabKeyboard` sur la fenêtre racine, en surveillant soi-même la combinaison de déverrouillage.
  - **Wayland** : il n'y a pas d'API globale, donc passe par `evdev`. Fais un `EVIOCGRAB` sur les périphériques clavier, puis réémets via `uinput` tout ce qui n'est pas bloqué (en mode `All`, rien n'est réémis sauf ce qui sert au déverrouillage). Ça demande l'accès à `/dev/input` et `/dev/uinput` (groupe `input` + règle udev).
  - Détecte la session (`XDG_SESSION_TYPE`) et, si les droits manquent, affiche dans l'UI un message avec la commande exacte à lancer. Fournis le fichier de règle udev dans le repo.
  - Ne plante jamais si le blocage est impossible : l'UI doit l'indiquer.

Avant de coder ces parties, regarde l'état actuel de crates comme `rdev` (feature de grab) et leur maintenance. Si un crate maintenu fait proprement le travail sur un OS, tu peux l'utiliser. Sinon, implémentation native. Explique-moi ton choix.

---

## 4. Fenêtre : centrée, adaptée à l'écran, environ 1/3

- La fenêtre fait **environ 1/3 de la largeur de la zone utile de l'écran** sur lequel elle s'ouvre, avec le ratio de la maquette (**760 × 584**, soit environ 1,301).
  - Calcul côté Rust au setup : `current_monitor()` (fallback `primary_monitor()`), puis `work_area()` (pour exclure la barre des tâches et le dock) et `scale_factor()`. Raisonne en tailles **logiques**.
  - `largeur = work_width / 3`, `hauteur = largeur / 1.301`. Si `hauteur > 55 % de work_height`, recalcule depuis la hauteur.
  - Bornes : minimum 600 × 461, maximum 1140 × 876 (logiques).
- **Centrée** dans la zone utile, pas dans l'écran brut.
- Crée la fenêtre avec `visible: false`, applique taille et position, puis `show()` pour éviter tout flash ou saut.
- `resizable: false`, `maximizable: false`. Barre de titre custom (`decorations: false`) avec `data-tauri-drag-region`, et boutons réduire / fermer (fermer = cacher dans le tray).
- Gère le changement d'écran ou de DPI (`ScaleFactorChanged`) en recalculant.
- **L'UI s'adapte à la taille de la fenêtre** :
  - tout est en `rem`, avec `html { font-size: calc(100vw / 47.5) }`, donc 1 rem = 16 px à 760 px de large ;
  - les sprites pixel art restent nets : taille de pixel entière (arrondie), `image-rendering: pixelated`, `shape-rendering: crispEdges` sur les SVG.

---

## 5. Design (à reproduire fidèlement)

**Maquette de référence fournie dans `docs/maquette/`** (copie-la telle quelle dans le repo) :
- `pattelock-maquette.html` : la fenêtre complète en HTML/CSS/JS autonome, polices embarquées. Ouvre-la dans un navigateur et clique dessus : le chat bascule actif / pause, les touches basculent bloquée / libre, « Changer » simule l'enregistrement du raccourci. `?etat=pause` force l'état pause. Le bouton « … » de la barre de titre ouvre l'écran Réglages (aussi accessible par `?vue=reglages`), où le choix du pelage et de l'accent s'applique réellement.
- Thème clair : `pattelock-actif.png`, `pattelock-pause.png`, `pattelock-tout-le-clavier.png` et `pattelock-reglages.png` (les trois états et l'écran Réglages).
- Thème sombre : `pattelock-sombre-actif.png`, `pattelock-sombre-pause.png` et `pattelock-sombre-reglages.png`.
- Toutes les captures sont à 760 × 584 (rendu @2x). Dans le HTML, `?etat=tout` force le mode clavier entier et `?theme=dark|light|system` force le thème.

Regarde les sept PNG avant de coder l'UI, et reprends directement les valeurs CSS du fichier HTML. Si ce document et la maquette divergent, **la maquette fait foi pour le visuel** et ce document fait foi pour le comportement. Tu peux réutiliser le CSS et la fonction de dessin du chat, mais pas l'état JS de démo, qui doit venir du Rust.

Style pixel art, minimaliste et sobre, mais fun. C'est la maquette « B » (bande clavier, le chat comme interrupteur) :

**Palette et thèmes (clair / sombre)**

Toutes les couleurs de l'UI passent par des **variables CSS** définies sur la racine, avec un jeu clair et un jeu sombre. Le thème sombre n'est **pas** une inversion automatique : ce sont les mêmes rôles avec d'autres valeurs. Dans le thème sombre, l'« encre » devient claire : les touches bloquées, les contours crantés et les boutons pleins passent en crème sur fond sombre.

| Rôle (variable) | Clair | Sombre |
|---|---|---|
| Fond `--bg` | `#fbfaf7` | `#1c1a21` |
| Encre / texte / contours `--ink` | `#1f1b24` | `#ece7df` |
| Texte secondaire `--muted` | `#6a6472` | `#aaa3b4` |
| Trait léger `--line` | `#ebe6dd` | `#2f2b36` |
| Fond de la bande clavier `--strip` | `#f1ede6` | `#26232c` |
| Bord bas des touches libres `--key-edge` | `#d9d3c9` | `#3d3846` |
| Fond des `<kbd>` et badge pause `--kbd` | `#efebe4` | `#2f2b36` |
| Liseré des touches libres `--ring` | `#e6e1d8` | `#34303b` |
| LED éteinte `--led-off` | `#b9b3bf` | `#5a5463` |
| Bord bas des touches bloquées et boutons pleins `--ink-edge` | `#000000` | `#b4ada2` |
| Ombre interne de la bande `--strip-shade` | `rgba(31,27,36,.08)` | `rgba(0,0,0,.25)` |
| Accent `--accent` (configurable) | `#ff9548` | `#ff9548` |

Le texte posé sur l'encre (touches bloquées, badge actif, bouton « Changer ») utilise `--bg`. Le focus visible utilise `--accent` pour rester visible dans les deux thèmes. Attention aux variables composées (comme le `box-shadow` des contours crantés) : elles doivent être déclarées au niveau où le thème s'applique, sinon elles gardent les couleurs claires.

**Polices** (embarquées, licence OFL) :
- *Pixelify Sans* (400 à 700) pour tout le texte ;
- *Silkscreen* pour les petits labels en capitales.

**Bordures pixel** : pas de `border-radius`. Les coins sont « crantés » avec `box-shadow: -4px 0 0 0 #1f1b24, 4px 0 0 0 #1f1b24, 0 -4px 0 0 #1f1b24, 0 4px 0 0 #1f1b24`. Le relief des touches se fait avec `inset 0 -4px 0 0 <couleur>`.

**Disposition, de haut en bas :**

1. **Barre de titre** (40 px) : patte pixel orange (5 × 5) + « Pattelock », puis à droite les boutons « … » (Réglages), réduire et fermer, en icônes pixel. Bordure basse de 3 px `#ebe6dd`.
2. **Bloc statut centré** :
   - badge Silkscreen avec une LED carrée de 8 px :
     - actif : fond encre, texte clair, « BLOCAGE EN COURS », LED orange qui clignote (`steps(1)`, 1,4 s) ;
     - pause : fond `#efebe4`, « EN PAUSE, RIEN N'EST BLOQUÉ », LED grise fixe ;
     - clavier entier : fond encre, « CLAVIER ENTIER VERROUILLÉ », LED orange qui clignote ;
   - titre 26 px gras : « Le chat dort » / « Le chat est réveillé » / « Le chat dort sur tout le clavier » ;
   - sous-titre 14 px gris : « 13 touches sont désactivées en ce moment, le reste du clavier répond normalement. » / « Clavier libre, toutes les touches répondent. » / « Toutes les touches sont ignorées, sauf Ctrl + Alt + K. La souris fonctionne toujours. » ;
   - indice avec une petite patte orange : « Clique sur le chat pour le réveiller » / « … pour l'endormir » / « Clique sur le chat ou fais Ctrl + Alt + K pour tout déverrouiller ».
3. **Bande clavier** (encadré cranté, fond `#f1ede6`, padding 20) :
   - 4 groupes séparés de 16 px : F1-F4, F5-F8, F9-F12, puis Impr. / Défil. / Pause ;
   - 4 px entre les touches ; touches F en 34 × 40, touches spéciales en 46 × 40 ;
   - le **chat entier, assis** (100 × 100, soit 5 px par pixel-sprite) est posé sur le bord haut de la bande, au centre : la ligne du bas du sprite touche le bord de la bande et la queue en crochet est à droite. C'est un `<button>` avec un `aria-label` explicite qui bascule l'état ;
   - quand il dort, « z Z » en Silkscreen orange flotte en haut à droite de sa tête.
4. **États des touches** (cliquer une touche la bascule bloquée / libre) :
   - *bloquée en ce moment* (protection active) : fond encre, texte clair, mini LED orange 4 × 4 en haut à droite ;
   - *prévue, pas encore bloquée* (protection en pause) : fond clair, contour encre de 2 px, sans remplissage ;
   - *libre* : fond clair, texte gris, bord bas `#d9d3c9`.
   - en mode clavier entier, toutes les touches de la bande passent en *bloquée* (y compris F5 et F11) et ne sont plus cliquables.
5. **Légende** centrée juste sous la bande (12 px) : 2 entrées si actif (« bloquée en ce moment », « libre »), 2 si pause (« prévue, pas encore bloquée », « libre »), 2 en clavier entier (« verrouillée », « tout le reste du clavier aussi, sauf Ctrl + Alt + K »).
6. **Statistique** sous la légende, dans tous les états : petite patte accent + « **1 284** coups de patte évités » (le nombre en encre et en gras, le texte en gris). Rien d'autre : pas de dernière touche, pas de phrase d'explication.
7. **Pied de page** :
   - à gauche, le bouton **« Verrouiller tout le clavier »** : cadenas pixel ouvert, fond clair, contour cranté encre. Actif, il devient « Déverrouiller le clavier », avec le cadenas fermé et un fond accent ;
   - à droite, le raccourci en `<kbd>` (fond `#efebe4`, bord bas `#d9d3c9`) + bouton « Changer » (fond encre). Pendant l'enregistrement : « Appuie sur ta combinaison… » et le bouton devient « Annuler ».

**Sprite du chat assis** : grille 20 × 20, un caractère par pixel. Rends-la en CSS grid, en SVG de `<rect>` ou en canvas, avec une taille de pixel entière. Le même sprite sert partout : fenêtre principale (5 px), vignettes des Réglages (4 px), icônes.

```
.OO..........OO.....
.OPO........OPO.....
.OPPO......OPPO.....
.OPPFOOOOOOFPPO.....
OFFFFFFFFFFFFFFO....
[yeux ligne 1]
[yeux ligne 2]
OFFFFFFFFFFFFFFO....
OPPFFFWPPWFFFPPO....
OFFFFWOWWOWFFFFO....
.OFFFFWOOWFFFFO.....
..OFFWWWWWWFFO......
.OFFFWWWWWWFFFO..OO.
.OFFFWWWWWWFFFO.OFO.
OFFFFWWWWWWFFFFO.OFO
OFFFFWWWWWWFFFFO.OFO
OFFFOWWOOWWOFFFOOFO.
OFFFOWWOOWWOFFFOFO..
OFFOWWWOOWWWOFFOO...
.OOOOOOOOOOOOOO.....
```

Lignes des yeux selon l'humeur (lignes 5 et 6, index à partir de 0) :

| Humeur | Ligne 5 | Ligne 6 |
|---|---|---|
| dort | `OFFFFFFFFFFFFFFO....` | `OFFOOOFFFFOOOFFO....` |
| éveillé | `OFFHEFFFFFFHEFFO....` | `OFFEEFFFFFFEEFFO....` |

Yeux éveillés : pupilles 2 × 2 en colonnes 3-4 et 11-12, reflet `H` en haut à gauche. Le fichier `docs/maquette/pattelock-maquette.html` contient ces frames en JSON (`FRAMES`), copiables telles quelles.

Pelages : `.` = transparent, O = contour, F = fourrure, P = rose, W = museau, E = œil, H = reflet.

| Pelage | O | F | W | P | E | H |
|---|---|---|---|---|---|---|
| noir (défaut) | `#121016` | `#3f3a48` | `#5d5668` | `#ea8c9c` | `#121016` | `#ffffff` |
| roux | `#2b2230` | `#f2a65a` | `#fff4e4` | `#f59aa8` | `#2b2230` | `#ffffff` |
| gris | `#2b2230` | `#a7a5b4` | `#eeeaf2` | `#f59aa8` | `#2b2230` | `#ffffff` |
| blanc | `#2b2230` | `#f7f3ec` | `#ffffff` | `#f59aa8` | `#2b2230` | `#ffffff` |
| siamois | `#2b2230` | `#ecd8ba` | `#f9efe0` | `#c9877a` | `#3d6fb8` | `#ffffff` |

**Chats en thème sombre** : le contour `O` des sprites est sombre et se perd sur le fond sombre, ce qui déforme la silhouette (les flancs et les pattes ressemblent à des ailes). On ne modifie **pas** le dessin. On ajoute un **halo d'1 pixel-sprite** de couleur `#5c566a` autour de la silhouette, sur tous les pelages : chaque pixel transparent qui touche un pixel plein (4 voisins) devient halo. La grille passe de 20 × 20 à 22 × 22, avec une marge négative d'1 pixel-sprite pour que le chat reste exactement à la même place (toujours posé sur la bande). Calcule le halo une fois par frame et mets-le en cache, pas à chaque rendu. En thème clair, pas de halo.

### Écran Réglages (voir `pattelock-reglages.png`)

Il s'ouvre avec le bouton « … » de la barre de titre, qui devient alors « ‹ Réglages » pour revenir. Il occupe la même fenêtre, sans popup.
- **Pelage du chat** (skin) : 5 vignettes cliquables (Noir, Roux, Gris, Blanc, Siamois). Chacune montre le chat assis éveillé à 4 px par pixel, avec le nom en dessous. La vignette choisie a un contour cranté encre et un liseré bas en couleur d'accent. C'est un `radiogroup` accessible.
  - Le choix s'applique **immédiatement** partout : chat principal, animations, notifications éventuelles.
  - Il est persisté dans le store.
  - Code les pelages comme une simple table de palettes (`skins.ts`) pour pouvoir en ajouter facilement : tigré, calico, tuxedo, etc. Si un pelage a besoin de motifs (rayures), prévois des pixels de motif optionnels dans la grille plutôt qu'un sprite séparé.
- **Couleur d'accent** : 4 carrés (Orange `#ff9548`, Rose `#f4a3b4`, Menthe `#7fd1a8`, Bleu `#8fb0ff`), appliqués via une variable CSS `--accent`.
- **Thème** : sélecteur segmenté à 3 choix, **Système / Clair / Sombre** (défaut : Système), avec une petite icône carrée par choix (moitié clair / moitié sombre pour Système). Le choix sélectionné est en fond encre.
  - *Système* suit l'OS **en direct**, via `prefers-color-scheme` et son événement `change` côté front, ou `onThemeChanged` / `theme()` de la fenêtre Tauri 2 (vérifie l'API exacte). Si l'utilisateur change le thème de son OS pendant que l'app tourne, elle bascule tout de suite.
  - Applique le thème **avant le premier affichage** pour éviter un flash clair au lancement en mode sombre : lis le réglage dans le store au setup, passe-le à la fenêtre, et règle aussi la couleur de fond de la fenêtre Tauri.
  - L'icône du tray suit le thème du système, et non celui de l'app (variante claire ou sombre de la barre des menus / barre des tâches).
- **Options** sous forme d'interrupteurs pixel :
  - « Lancer Pattelock au démarrage » (autostart) ;
  - « Bloquer aussi les fonctions média de la rangée du haut (Mac) », visible uniquement sur macOS.

### Animations du chat (important, c'est ce qui rend l'app vivante)

La maquette est statique, mais le chat doit être **animé**. Règle d'or : on reste en pixel art. Pas de rotation, de flou ni de déplacement sous-pixel. Tout bouge par **frames** (on change des pixels de la grille) ou par **translations d'un nombre entier de pixels-sprite**, avec des timings en `steps()`. Crée un petit module `catAnimator.ts` (canvas 2D ou grille DOM) qui gère des frames définies comme la grille 20 × 20 du chat assis, et une boucle `requestAnimationFrame`.

**Quand il dort (protection active)**
- **Respiration** : environ toutes les 2,5 s, le poitrail (zone `W`) s'élargit d'1 pixel de chaque côté, la tête descend d'1 pixel-sprite, puis tout revient. Ce sont 2 frames, les pattes et la ligne du bas ne bougent jamais (il reste posé sur la bande). Le rythme doit être lent et régulier, sans à-coup.
- **Queue** : en dormant, elle reste enroulée et bouge à peine (le bout se décale d'1 pixel toutes les 6 à 10 s).
- **Les « z »** : trois « z » en Silkscreen orange, de tailles croissantes (z, z, Z), naissent au-dessus de sa tête l'un après l'autre (décalés d'environ 0,8 s). Chacun monte en diagonale vers la droite par sauts de 2 px, ondule légèrement, puis disparaît en 2 ou 3 paliers d'opacité, en boucle.
- **Petits détails aléatoires** (toutes les 8 à 15 s) : une oreille qui frémit (1 frame, 150 ms), ou un petit « mlem » (2 frames).
- **Quand une touche est interceptée** (événement `key-intercepted`) : l'oreille la plus proche de la touche frémit et un mini « ! » apparaît 400 ms, sans le réveiller. C'est le feedback visuel que le blocage a vraiment agi.

**Quand il est réveillé (protection en pause)**
- **Ses yeux suivent le curseur**. La pupille (2 × 2) se déplace dans une zone d'œil élargie : 3 positions horizontales (gauche, centre, droite) × 2 verticales (haut, bas). Le reflet `H` reste toujours en haut à gauche de la pupille. Redessine la zone des yeux en conséquence, en restant lisible.
  - Dans la fenêtre : `mousemove` sur tout le document.
  - Hors de la fenêtre : si c'est possible, suis le curseur **global** via `cursor_position()` de Tauri 2 (vérifie l'API exacte dans la version utilisée). Poll côté Rust à 20-30 Hz **uniquement** quand la fenêtre est visible et le chat éveillé, puis calcule la direction par rapport à la position écran du chat (position de la fenêtre + offset du sprite, en tenant compte du scale factor).
  - Si la position globale est indisponible (notamment sous Wayland), on se rabat sur le curseur dans la fenêtre. Sans curseur pendant 5 s, il regarde au centre.
- **Clignement** des yeux toutes les 3 à 6 s, de manière aléatoire, avec parfois un double clignement.
- **Mouvements d'idle** aléatoires toutes les 4 à 10 s, un à la fois :
  - queue qui fouette : 3 ou 4 frames de queue (crochet à droite, droite, crochet plus haut), en boucle courte, puis retour ;
  - toilette : il lève une patte avant jusqu'à la bouche et la lèche (3 frames) ;
  - tête penchée (la tête seule, lignes 0 à 10, se décale d'1 px à gauche ou à droite pendant 1 s) ;
  - oreille qui tourne ;
  - petit étirement ou sautillement sur place (monte de 2 px puis redescend, en 3 frames) ;
  - regard qui balaie de gauche à droite si le curseur ne bouge pas.
- **Au survol du chat** : les oreilles se dressent (1 frame) et le curseur devient `pointer`.

**Transitions**
- **Réveil** (clic ou raccourci) : environ 500 ms. Un œil s'ouvre, puis les deux, puis un bâillement (bouche ouverte sur 2 frames), puis l'état éveillé.
- **Endormissement** : environ 600 ms. Les yeux se plissent à moitié, puis se ferment, puis les « z » apparaissent.
- La bascule d'état ne doit jamais attendre la fin de l'animation : l'état réel (blocage) change **immédiatement**, seule l'animation suit.

**Contraintes**
- Mets toutes les animations en pause quand la fenêtre est cachée ou réduite (`visibilitychange` et événements de fenêtre Tauri), et arrête le poll du curseur global dans ce cas. Zéro CPU inutile, puisque l'app tourne en permanence dans le tray.
- Respecte `prefers-reduced-motion` : dans ce cas, le chat reste fixe, avec seulement les frames d'état (dort ou éveillé) et des « z » statiques.
- Ajoute à la maquette HTML de `docs/maquette/` une page de démo (`anim-demo.html`) qui montre toutes les animations, pour que je puisse valider avant l'intégration.

**Icônes de l'app et du tray** : génère-les à partir du chat assis en pixel art (pelage noir par défaut) (avec `npx tauri icon` pour les formats). Pour le tray, une version monochrome, avec une variante endormie et une variante éveillée.

**Accessibilité** : de vrais `<button>` partout, `aria-pressed` sur les touches et sur le chat, focus visible (outline 3 px encre), contrastes AA.

---

## 6. Packaging et release

Base-toi sur **https://github.com/HugoSohm/riptune**, en particulier `.github/workflows/release.yml` et `scripts/macos/`.

- **Windows** : installateur NSIS (x64 + arm64) via `tauri-action`.
- **Linux** : AppImage + .deb + .rpm. Le .deb et le .rpm installent la règle udev (voir section 3).
- **macOS** : je n'ai **pas de certificat Apple Developer**. On ne passe donc pas par le DMG de Tauri. On fait exactement comme dans riptune :
  - build avec `--target aarch64-apple-darwin --bundles app` et `--target x86_64-apple-darwin --bundles app` ;
  - copie `scripts/macos/build.sh`, adapte-le (`APP_NAME="Pattelock"`, `VOLUME_NAME="Pattelock"`, nom de sortie `Pattelock_${VERSION}_${ARCH}.dmg`) en gardant toute la logique : `hdiutil create`, `.background`, mise en page via AppleScript (app à `{200, 250}`, lien Applications à `{600, 250}`, `instructions.txt` à `{400, 110}`, fenêtre `{200, 120, 1000, 745}`), détachement robuste avec retries, conversion UDZO ;
  - **ajoute une re-signature ad hoc** (`codesign --force --deep --sign - "$MACOS_APP"`) après toute modification du `.app` (copie de l'icône comprise), sinon le bundle est invalide sur Apple Silicon. Mets aussi `"signingIdentity": "-"` dans la config bundle macOS ;
  - crée un `scripts/macos/dmg-background.png` de 800 × 625 dans le style pixel de l'app : fond `#fbfaf7`, flèche pixel de l'app vers Applications, petit chat ;
  - `scripts/macos/instructions.txt` en FR et EN :
    1. glisser Pattelock.app dans Applications ;
    2. lancer `sudo xattr -c /Applications/Pattelock.app` dans un terminal ;
    3. au premier lancement, autoriser Pattelock dans *Réglages Système > Confidentialité et sécurité > Accessibilité* (nécessaire pour bloquer les touches).
- **Workflow GitHub Actions** : reprends la structure de riptune.
  - Un job `check-version` qui ne publie que si la version de `package.json` est nouvelle.
  - Une matrice : macOS arm64, macOS x64, ubuntu-22.04, Windows x64, Windows arm64.
  - Une étape « Package macOS DMG » qui appelle `ARCH_OVERRIDE=… ./scripts/macos/build.sh`, puis la release en draft, l'upload et la publication.
  - Retire tout ce qui est propre à riptune (`setup_bin`, `RESEND_API_KEY`, `APTABASE_API_KEY`). Pas d'updater pour la v1.
  - Ajoute aussi un `checks.yml` : `cargo fmt --check`, `clippy`, `tsc --noEmit` et un build sur les 3 OS.
- README avec installation par OS, permissions (Accessibilité sur macOS, groupe `input` sous Wayland) et build local.

---

## 7. Façon de travailler

1. Commence par me montrer : les versions exactes retenues, l'arborescence prévue et ton choix de technique de blocage pour chaque OS (avec ses limites).
2. Implémente dans cet ordre :
   1. squelette Tauri 2 + fenêtre 1/3 centrée ;
   2. UI statique fidèle au design ;
   3. store et état ;
   4. keyguard Windows ;
   5. keyguard macOS ;
   6. keyguard Linux X11, puis Wayland ;
   7. raccourci global ;
   8. tray ;
   9. autostart ;
   10. CI et packaging.

   Fais un commit propre à chaque étape.
3. Écris des tests unitaires Rust pour le mapping des touches, la logique d'état, le calcul de taille de fenêtre (fonction pure testée avec plusieurs résolutions : 1366 × 768, 1920 × 1080, 2560 × 1440, 3840 × 2160 à 200 %, MacBook 1512 × 982) et l'incrément / la persistance du compteur total.
4. Ne marque rien comme terminé sans l'avoir compilé. Si tu ne peux pas tester un OS localement, dis-le explicitement et indique ce que je dois vérifier à la main.
5. Pas de tiret cadratin « — » dans les textes de l'UI.
