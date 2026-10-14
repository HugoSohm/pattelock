/**
 * Textes de l'interface en français et en anglais (pas de tiret cadratin dans l'UI).
 * `{nom}` dans un texte est remplacé par le paramètre du même nom.
 */

export type Lang = "fr" | "en";
export type LangPref = "system" | Lang;

const fr = {
  // Écran principal
  "tag.fkeys": "BLOCAGE EN COURS",
  "tag.off": "EN PAUSE, RIEN N’EST BLOQUÉ",
  "tag.all": "CLAVIER ENTIER VERROUILLÉ",
  "title.fkeys": "Le chat dort",
  "title.off": "Le chat est réveillé",
  "title.all": "Le chat dort sur tout le clavier",
  "sub.fkeys.zero": "Aucune touche n’est choisie, tout le clavier répond normalement.",
  "sub.fkeys.one": "1 touche est désactivée en ce moment, le reste du clavier répond normalement.",
  "sub.fkeys.many": "{n} touches sont désactivées en ce moment, le reste du clavier répond normalement.",
  "sub.off": "Clavier libre, toutes les touches répondent.",
  "sub.all": "Toutes les touches sont ignorées, sauf {sc}. La souris fonctionne toujours.",
  "hint.fkeys": "Clique sur le chat pour le réveiller",
  "hint.off": "Clique sur le chat pour l’endormir",
  "hint.all": "Clique sur le chat ou fais {sc} pour tout déverrouiller",
  "cat.fkeys": "Le chat dort, blocage en cours. Cliquer pour le réveiller.",
  "cat.off": "Le chat est réveillé, protection en pause. Cliquer pour l’endormir.",
  "cat.all": "Le chat dort sur tout le clavier. Cliquer pour le réveiller et tout déverrouiller.",
  "state.blocked": "bloquée en ce moment",
  "state.free": "libre",
  "state.planned": "prévue, pas encore bloquée",
  "state.locked": "verrouillée",
  "state.lockedAll": "verrouillée avec tout le clavier",
  "legend.allRest": "tout le reste du clavier aussi, sauf {sc}",
  "counter.one": "coup de patte évité",
  "counter.many": "coups de patte évités",
  "keys.selectAll": "Tout sélectionner",
  "keys.deselectAll": "Tout désélectionner",
  "lock.on": "Verrouiller tout le clavier",
  "lock.off": "Déverrouiller le clavier",
  "shortcut.recording": "Appuie sur ta combinaison…",
  "shortcut.change": "Changer",
  "shortcut.cancel": "Annuler",
  "shortcut.changeAria": "Changer le raccourci {sc}",
  "shortcut.cancelAria": "Annuler l’enregistrement du raccourci",
  // Erreurs du raccourci
  "error.missingKey": "Ajoute une touche aux modificateurs.",
  "error.missingModifier": "Ajoute {mods} : une touche seule pourrait être pressée par le chat.",
  "error.blockable": "Cette touche peut être bloquée, choisis-en une autre.",
  "error.unsupported": "Cette touche n’est pas prise en charge.",
  "error.taken": "Cette combinaison est déjà prise par le système.",
  "error.refused": "Combinaison refusée.",
  "error.or": "ou",
  // Barre de titre
  "titlebar.settings": "Réglages",
  "titlebar.back": "Retour à l’écran principal",
  "titlebar.minimize": "Réduire la fenêtre",
  "titlebar.close": "Fermer la fenêtre (Pattelock reste dans la barre des tâches)",
  // Réglages
  "settings.coat": "PELAGE DU CHAT",
  "settings.accent": "COULEUR D’ACCENT",
  "settings.theme": "THÈME",
  "settings.language": "LANGUE",
  "skin.noir": "Noir",
  "skin.roux": "Roux",
  "skin.gris": "Gris",
  "skin.blanc": "Blanc",
  "skin.siamois": "Siamois",
  "accent.orange": "Orange",
  "accent.rose": "Rose",
  "accent.menthe": "Menthe",
  "accent.bleu": "Bleu",
  "theme.system": "Système",
  "theme.light": "Clair",
  "theme.dark": "Sombre",
  "lang.system": "Système",
  "opt.autostart": "Lancer Pattelock au démarrage",
  "opt.media": "Bloquer aussi les fonctions média de la rangée du haut (Mac)",
  "opt.updates": "Rechercher les mises à jour automatiquement",
  // Mises à jour
  "update.available": "Pattelock {version} est disponible.",
  "update.install": "Mettre à jour",
  "update.downloading": "Téléchargement de la mise à jour… {p} %",
  "update.downloadingNoSize": "Téléchargement de la mise à jour…",
  "update.installing": "Installation de la mise à jour…",
  "update.failed": "La mise à jour a échoué.",
  "update.retry": "Réessayer",
  // Permissions et état du blocage
  "notice.ax.title": "Pattelock a besoin de l’Accessibilité",
  "notice.ax.text":
    "Pour bloquer des touches, macOS doit autoriser Pattelock dans Réglages Système, Confidentialité et sécurité, Accessibilité. Coche Pattelock dans la liste, puis reviens ici.",
  "notice.ax.button": "Ouvrir les Réglages Système",
  "notice.input.title": "Accès au clavier nécessaire",
  "notice.input.text":
    "Sous Wayland, Pattelock passe par /dev/input et /dev/uinput. Lance cette commande dans un terminal, puis ferme ta session et reconnecte-toi :",
  "notice.input.button": "Réessayer",
  "reason.unsupported": "Le blocage des touches n’est pas disponible sur ce système.",
  "reason.alreadyInstalled": "Le hook clavier est déjà installé.",
  "reason.hookRefused": "Windows a refusé le hook clavier.",
  "reason.threadFailed": "Le blocage n’a pas pu démarrer.",
  "reason.tapRefused":
    "macOS a refusé l’interception du clavier. Vérifie l’autorisation Accessibilité, puis relance Pattelock.",
  "reason.runLoop": "Boucle d’événements macOS indisponible.",
  "reason.x11Lost": "Connexion au serveur X perdue.",
  "reason.keyboardBusy":
    "Une autre application tient déjà le clavier : le verrouillage complet n’a pas pu s’activer.",
  "reason.uinputFailed": "Le clavier virtuel uinput n’a pas pu être créé.",
  "reason.noKeyboard": "Aucun clavier accessible n’a été trouvé.",
  "reason.partial": "{keys} déjà prise(s) par le système, impossible de la bloquer.",
  // Touches
  "key.printScreen": "Impr.",
  "key.printScreen.name": "Impression écran",
  "key.scrollLock": "Défil.",
  "key.scrollLock.name": "Arrêt défilement",
  "key.pause": "Pause",
  "key.escape": "Échap",
  "key.escape.name": "Échap",
  "key.insert": "Inser",
  "key.insert.name": "Insertion",
  "key.help": "Aide",
  "key.help.name": "Aide",
  "key.home": "Début",
  "key.home.name": "Début",
  "key.pageUp": "Pg préc",
  "key.pageUp.name": "Page précédente",
  "key.delete": "Suppr",
  "key.delete.name": "Suppression",
  "key.end": "Fin",
  "key.end.name": "Fin",
  "key.pageDown": "Pg suiv",
  "key.pageDown.name": "Page suivante",
  "mod.shift": "Maj",
  "code.Space": "Espace",
  "code.Enter": "Entrée",
  "code.Tab": "Tab",
  "code.Backspace": "Retour",
  "code.Escape": "Échap",
  "code.Insert": "Inser",
  "code.Delete": "Suppr",
  "code.Home": "Début",
  "code.End": "Fin",
  "code.PageUp": "Page haut",
  "code.PageDown": "Page bas",
  "code.ArrowUp": "Haut",
  "code.ArrowDown": "Bas",
  "code.ArrowLeft": "Gauche",
  "code.ArrowRight": "Droite",
  "code.numpad": "Pavé {n}",
};

export type TextKey = keyof typeof fr;

const en: Record<TextKey, string> = {
  "tag.fkeys": "BLOCKING ON",
  "tag.off": "PAUSED, NOTHING IS BLOCKED",
  "tag.all": "WHOLE KEYBOARD LOCKED",
  "title.fkeys": "The cat is asleep",
  "title.off": "The cat is awake",
  "title.all": "The cat is asleep on the whole keyboard",
  "sub.fkeys.zero": "No key is selected, the whole keyboard works normally.",
  "sub.fkeys.one": "1 key is disabled right now, the rest of the keyboard works normally.",
  "sub.fkeys.many": "{n} keys are disabled right now, the rest of the keyboard works normally.",
  "sub.off": "Keyboard free, every key works.",
  "sub.all": "Every key is ignored except {sc}. The mouse still works.",
  "hint.fkeys": "Click the cat to wake it up",
  "hint.off": "Click the cat to put it to sleep",
  "hint.all": "Click the cat or press {sc} to unlock everything",
  "cat.fkeys": "The cat is asleep, blocking is on. Click to wake it up.",
  "cat.off": "The cat is awake, protection is paused. Click to put it to sleep.",
  "cat.all": "The cat is asleep on the whole keyboard. Click to wake it up and unlock everything.",
  "state.blocked": "blocked right now",
  "state.free": "free",
  "state.planned": "planned, not blocked yet",
  "state.locked": "locked",
  "state.lockedAll": "locked with the whole keyboard",
  "legend.allRest": "the rest of the keyboard too, except {sc}",
  "counter.one": "paw strike avoided",
  "counter.many": "paw strikes avoided",
  "keys.selectAll": "Select all",
  "keys.deselectAll": "Deselect all",
  "lock.on": "Lock the whole keyboard",
  "lock.off": "Unlock the keyboard",
  "shortcut.recording": "Press your combination…",
  "shortcut.change": "Change",
  "shortcut.cancel": "Cancel",
  "shortcut.changeAria": "Change the shortcut {sc}",
  "shortcut.cancelAria": "Cancel shortcut recording",
  "error.missingKey": "Add a key to the modifiers.",
  "error.missingModifier": "Add {mods}: the cat could press a single key.",
  "error.blockable": "This key can be blocked, pick another one.",
  "error.unsupported": "This key is not supported.",
  "error.taken": "This combination is already used by the system.",
  "error.refused": "Combination refused.",
  "error.or": "or",
  "titlebar.settings": "Settings",
  "titlebar.back": "Back to the main screen",
  "titlebar.minimize": "Minimize the window",
  "titlebar.close": "Close the window (Pattelock stays in the taskbar)",
  "settings.coat": "CAT COAT",
  "settings.accent": "ACCENT COLOR",
  "settings.theme": "THEME",
  "settings.language": "LANGUAGE",
  "skin.noir": "Black",
  "skin.roux": "Ginger",
  "skin.gris": "Grey",
  "skin.blanc": "White",
  "skin.siamois": "Siamese",
  "accent.orange": "Orange",
  "accent.rose": "Pink",
  "accent.menthe": "Mint",
  "accent.bleu": "Blue",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "lang.system": "System",
  "opt.autostart": "Launch Pattelock at startup",
  "opt.media": "Also block the media functions of the top row (Mac)",
  "opt.updates": "Check for updates automatically",
  "update.available": "Pattelock {version} is available.",
  "update.install": "Update",
  "update.downloading": "Downloading the update… {p}%",
  "update.downloadingNoSize": "Downloading the update…",
  "update.installing": "Installing the update…",
  "update.failed": "The update failed.",
  "update.retry": "Try again",
  "notice.ax.title": "Pattelock needs Accessibility",
  "notice.ax.text":
    "To block keys, macOS must allow Pattelock in System Settings, Privacy & Security, Accessibility. Check Pattelock in the list, then come back here.",
  "notice.ax.button": "Open System Settings",
  "notice.input.title": "Keyboard access required",
  "notice.input.text":
    "On Wayland, Pattelock uses /dev/input and /dev/uinput. Run this command in a terminal, then log out and back in:",
  "notice.input.button": "Try again",
  "reason.unsupported": "Key blocking is not available on this system.",
  "reason.alreadyInstalled": "The keyboard hook is already installed.",
  "reason.hookRefused": "Windows refused the keyboard hook.",
  "reason.threadFailed": "Blocking could not start.",
  "reason.tapRefused":
    "macOS refused to let Pattelock intercept the keyboard. Check the Accessibility permission, then restart Pattelock.",
  "reason.runLoop": "macOS event loop unavailable.",
  "reason.x11Lost": "Connection to the X server lost.",
  "reason.keyboardBusy": "Another app is holding the keyboard: the full lock could not turn on.",
  "reason.uinputFailed": "The uinput virtual keyboard could not be created.",
  "reason.noKeyboard": "No accessible keyboard was found.",
  "reason.partial": "{keys} already used by the system, cannot be blocked.",
  "key.printScreen": "PrtSc",
  "key.printScreen.name": "Print Screen",
  "key.scrollLock": "ScrLk",
  "key.scrollLock.name": "Scroll Lock",
  "key.pause": "Pause",
  "key.escape": "Esc",
  "key.escape.name": "Escape",
  "key.insert": "Ins",
  "key.insert.name": "Insert",
  "key.help": "Help",
  "key.help.name": "Help",
  "key.home": "Home",
  "key.home.name": "Home",
  "key.pageUp": "PgUp",
  "key.pageUp.name": "Page Up",
  "key.delete": "Del",
  "key.delete.name": "Delete",
  "key.end": "End",
  "key.end.name": "End",
  "key.pageDown": "PgDn",
  "key.pageDown.name": "Page Down",
  "mod.shift": "Shift",
  "code.Space": "Space",
  "code.Enter": "Enter",
  "code.Tab": "Tab",
  "code.Backspace": "Backspace",
  "code.Escape": "Esc",
  "code.Insert": "Ins",
  "code.Delete": "Del",
  "code.Home": "Home",
  "code.End": "End",
  "code.PageUp": "PgUp",
  "code.PageDown": "PgDn",
  "code.ArrowUp": "Up",
  "code.ArrowDown": "Down",
  "code.ArrowLeft": "Left",
  "code.ArrowRight": "Right",
  "code.numpad": "Num {n}",
};

const DICTS: Record<Lang, Record<TextKey, string>> = { fr, en };

let current: Lang = "fr";

/** Langue de l'OS : français si l'une des langues préférées est le français, sinon anglais. */
export function systemLang(languages: readonly string[] = navigator.languages): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().slice(0, 2);
    if (base === "fr") return "fr";
    if (base === "en") return "en";
  }
  return "en";
}

export function resolveLang(pref: LangPref): Lang {
  return pref === "system" ? systemLang() : pref;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function lang(): Lang {
  return current;
}

export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  const text = DICTS[current][key] ?? fr[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function hasText(key: string): key is TextKey {
  return key in fr;
}

const NUMBER: Record<Lang, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat("fr-FR"),
  en: new Intl.NumberFormat("en-US"),
};

/** « 1 284 » (espace fine insécable) en français, « 1,284 » en anglais. */
export function formatCount(n: number): string {
  return NUMBER[current].format(n);
}
