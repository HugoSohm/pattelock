//! Logique d'état : les 3 modes et leurs transitions (fonctions pures).

use serde::{Deserialize, Serialize};

/// `Off` : rien n'est bloqué (chat réveillé). `Fkeys` : les touches choisies sont
/// bloquées (chat endormi). `All` : tout le clavier est bloqué sauf le raccourci.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Off,
    #[default]
    Fkeys,
    All,
}

/// Ce qui peut faire changer de mode.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    /// Clic sur le chat, ou « Endormir / Réveiller le chat » dans le tray.
    Cat,
    /// Bouton « Verrouiller / Déverrouiller tout le clavier », ou le tray.
    LockAll,
    /// Raccourci global (ou combinaison détectée par le hook en mode `All`).
    Shortcut,
}

pub fn next_mode(mode: Mode, action: Action) -> Mode {
    match (action, mode) {
        // Le chat se réveille : pause, y compris depuis le mode clavier entier.
        (Action::Cat, Mode::Fkeys | Mode::All) => Mode::Off,
        (Action::Cat, Mode::Off) => Mode::Fkeys,
        (Action::LockAll, Mode::All) => Mode::Fkeys,
        (Action::LockAll, _) => Mode::All,
        // Le raccourci bascule on/off, et ramène au mode F-keys depuis le clavier entier.
        (Action::Shortcut, Mode::Off | Mode::All) => Mode::Fkeys,
        (Action::Shortcut, Mode::Fkeys) => Mode::Off,
    }
}

/// Ce qu'on persiste : la protection est-elle active ? (Le mode `All` n'est jamais
/// restauré, il redevient le mode F-keys.)
pub fn persisted_active(mode: Mode) -> bool {
    mode != Mode::Off
}

/// Mode au démarrage.
pub fn startup_mode(active: bool) -> Mode {
    if active {
        Mode::Fkeys
    } else {
        Mode::Off
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cat_toggles_sleep_and_wakes_from_all() {
        assert_eq!(next_mode(Mode::Off, Action::Cat), Mode::Fkeys);
        assert_eq!(next_mode(Mode::Fkeys, Action::Cat), Mode::Off);
        assert_eq!(next_mode(Mode::All, Action::Cat), Mode::Off);
    }

    #[test]
    fn lock_all_enters_and_leaves_to_fkeys() {
        assert_eq!(next_mode(Mode::Off, Action::LockAll), Mode::All);
        assert_eq!(next_mode(Mode::Fkeys, Action::LockAll), Mode::All);
        assert_eq!(next_mode(Mode::All, Action::LockAll), Mode::Fkeys);
    }

    #[test]
    fn shortcut_toggles_and_unlocks_to_fkeys() {
        assert_eq!(next_mode(Mode::Off, Action::Shortcut), Mode::Fkeys);
        assert_eq!(next_mode(Mode::Fkeys, Action::Shortcut), Mode::Off);
        assert_eq!(next_mode(Mode::All, Action::Shortcut), Mode::Fkeys);
    }

    #[test]
    fn whole_keyboard_mode_is_never_restored() {
        for mode in [Mode::Off, Mode::Fkeys, Mode::All] {
            let restored = startup_mode(persisted_active(mode));
            assert_ne!(restored, Mode::All);
            assert_eq!(restored == Mode::Off, mode == Mode::Off);
        }
    }

    #[test]
    fn serializes_like_the_front() {
        assert_eq!(serde_json::to_string(&Mode::Fkeys).unwrap(), "\"fkeys\"");
        assert_eq!(serde_json::to_string(&Mode::All).unwrap(), "\"all\"");
    }
}
