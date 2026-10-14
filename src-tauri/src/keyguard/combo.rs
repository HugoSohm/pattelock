//! Détection de la combinaison de déverrouillage dans le hook lui-même : suivi de l'état
//! des modificateurs et comparaison avec le raccourci, en codes natifs de l'OS.

use crate::shortcut::Shortcut;

/// Ensemble de modificateurs (bits).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Mods(pub u8);

impl Mods {
    pub const CTRL: u8 = 1;
    pub const ALT: u8 = 2;
    pub const SHIFT: u8 = 4;
    pub const META: u8 = 8;

    pub fn from_shortcut(s: &Shortcut) -> Self {
        let mut m = 0;
        if s.ctrl {
            m |= Self::CTRL;
        }
        if s.alt {
            m |= Self::ALT;
        }
        if s.shift {
            m |= Self::SHIFT;
        }
        if s.meta {
            m |= Self::META;
        }
        Self(m)
    }
}

/// Une touche de modification, côté gauche ou droit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModKey {
    CtrlL,
    CtrlR,
    AltL,
    AltR,
    ShiftL,
    ShiftR,
    MetaL,
    MetaR,
}

impl ModKey {
    fn slot(self) -> u8 {
        self as u8
    }

    fn group(self) -> u8 {
        match self {
            Self::CtrlL | Self::CtrlR => Mods::CTRL,
            Self::AltL | Self::AltR => Mods::ALT,
            Self::ShiftL | Self::ShiftR => Mods::SHIFT,
            Self::MetaL | Self::MetaR => Mods::META,
        }
    }

    const ALL: [ModKey; 8] = [
        Self::CtrlL,
        Self::CtrlR,
        Self::AltL,
        Self::AltR,
        Self::ShiftL,
        Self::ShiftR,
        Self::MetaL,
        Self::MetaR,
    ];
}

/// Combinaison de déverrouillage : modificateurs + code natif de la touche principale.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Unlock {
    pub mods: Mods,
    /// Code natif (Windows : scancode | 0x100 si étendu ; macOS : keycode ; Linux : evdev).
    pub code: u32,
}

impl Default for Unlock {
    fn default() -> Self {
        Self::from_shortcut(&Shortcut::default())
    }
}

impl Unlock {
    pub fn from_shortcut(s: &Shortcut) -> Self {
        Self {
            mods: Mods::from_shortcut(s),
            code: native_code(&s.key).unwrap_or(u32::MAX),
        }
    }

    pub fn pack(self) -> u64 {
        (u64::from(self.mods.0) << 32) | u64::from(self.code)
    }

    pub fn unpack(v: u64) -> Self {
        Self {
            mods: Mods((v >> 32) as u8),
            code: v as u32,
        }
    }
}

/// Code natif de la touche principale d'un raccourci, pour l'OS courant.
pub fn native_code(code: &str) -> Option<u32> {
    #[cfg(windows)]
    return super::keys::windows_scancode(code).map(|(sc, ext)| windows_native(sc, ext));
    #[cfg(target_os = "macos")]
    return super::keys::macos_shortcut_keycode(code).map(u32::from);
    #[cfg(not(any(windows, target_os = "macos")))]
    return super::keys::evdev_code(code).map(u32::from);
}

/// Code natif Windows : scancode, avec le bit 8 pour les touches étendues.
pub fn windows_native(scancode: u16, extended: bool) -> u32 {
    u32::from(scancode) | if extended { 0x100 } else { 0 }
}

/// Suit les modificateurs enfoncés, d'après les événements vus par le hook.
#[derive(Default, Debug)]
pub struct ModTracker {
    down: u8,
}

/// Résultat du traitement d'une touche par le tracker.
#[derive(Debug, PartialEq, Eq)]
pub enum ComboEvent {
    /// Touche de modification (enfoncée ou relâchée).
    Modifier,
    /// La combinaison de déverrouillage vient d'être pressée.
    Unlock,
    /// Toute autre touche.
    Other,
}

impl ModTracker {
    pub fn modifier(&mut self, key: ModKey, down: bool) {
        if down {
            self.down |= 1 << key.slot();
        } else {
            self.down &= !(1 << key.slot());
        }
    }

    /// Modificateurs enfoncés, sans distinction gauche / droite.
    pub fn mods(&self) -> Mods {
        Mods(
            ModKey::ALL
                .into_iter()
                .filter(|k| self.down & (1 << k.slot()) != 0)
                .fold(0, |m, k| m | k.group()),
        )
    }

    pub fn reset(&mut self) {
        self.down = 0;
    }

    /// Traite une touche. `modifier` : la touche est-elle un modificateur ?
    pub fn handle(
        &mut self,
        modifier: Option<ModKey>,
        code: u32,
        down: bool,
        unlock: Unlock,
    ) -> ComboEvent {
        if let Some(m) = modifier {
            self.modifier(m, down);
            return ComboEvent::Modifier;
        }
        if down && code == unlock.code && self.mods() == unlock.mods {
            return ComboEvent::Unlock;
        }
        ComboEvent::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctrl_alt_k() -> Unlock {
        Unlock {
            mods: Mods(Mods::CTRL | Mods::ALT),
            code: 37,
        }
    }

    #[test]
    fn pack_round_trip() {
        let u = ctrl_alt_k();
        assert_eq!(Unlock::unpack(u.pack()), u);
        let u = Unlock {
            mods: Mods(Mods::META | Mods::SHIFT),
            code: windows_native(0x48, true),
        };
        assert_eq!(Unlock::unpack(u.pack()), u);
    }

    #[test]
    fn detects_combo_with_left_or_right_modifiers() {
        let u = ctrl_alt_k();
        let mut t = ModTracker::default();
        assert_eq!(t.handle(None, 37, true, u), ComboEvent::Other);
        t.handle(Some(ModKey::CtrlL), 0, true, u);
        assert_eq!(t.handle(None, 37, true, u), ComboEvent::Other);
        t.handle(Some(ModKey::AltR), 0, true, u);
        assert_eq!(t.handle(None, 37, true, u), ComboEvent::Unlock);
        // Relâchement de la touche : pas de deuxième déclenchement.
        assert_eq!(t.handle(None, 37, false, u), ComboEvent::Other);
    }

    #[test]
    fn extra_modifier_does_not_match() {
        let u = ctrl_alt_k();
        let mut t = ModTracker::default();
        t.modifier(ModKey::CtrlL, true);
        t.modifier(ModKey::AltL, true);
        t.modifier(ModKey::ShiftL, true);
        assert_eq!(t.handle(None, 37, true, u), ComboEvent::Other);
        t.modifier(ModKey::ShiftL, false);
        assert_eq!(t.handle(None, 37, true, u), ComboEvent::Unlock);
    }

    #[test]
    fn releasing_one_side_keeps_the_other() {
        let mut t = ModTracker::default();
        t.modifier(ModKey::CtrlL, true);
        t.modifier(ModKey::CtrlR, true);
        t.modifier(ModKey::CtrlL, false);
        assert_eq!(t.mods(), Mods(Mods::CTRL));
        t.modifier(ModKey::CtrlR, false);
        assert_eq!(t.mods(), Mods(0));
    }

    #[test]
    fn wrong_key_does_not_match() {
        let u = ctrl_alt_k();
        let mut t = ModTracker::default();
        t.modifier(ModKey::CtrlL, true);
        t.modifier(ModKey::AltL, true);
        assert_eq!(t.handle(None, 38, true, u), ComboEvent::Other);
    }

    #[test]
    fn default_unlock_uses_k() {
        let u = Unlock::default();
        assert_ne!(u.code, u32::MAX);
        #[cfg(windows)]
        assert_eq!(u.code, 0x25);
        #[cfg(target_os = "macos")]
        assert_eq!(u.code, 0x28);
        #[cfg(target_os = "linux")]
        assert_eq!(u.code, 37);
    }
}
