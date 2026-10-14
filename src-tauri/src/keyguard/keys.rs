//! Touches bloquables et correspondances avec les codes natifs de chaque OS.
//!
//! Les tables sont des fonctions pures, compilées sur tous les OS pour être testées
//! partout. Les touches du raccourci sont identifiées par leur position physique
//! (`KeyboardEvent.code` côté front : `KeyK`, `Digit1`...), comme les scancodes Windows,
//! les keycodes macOS et les codes evdev, ce qui évite les surprises AZERTY / QWERTY.

use serde::{Deserialize, Serialize};

/// Une des 15 touches de la bande clavier.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum BlockableKey {
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    PrintScreen,
    ScrollLock,
    Pause,
}

impl BlockableKey {
    pub const ALL: [BlockableKey; 15] = [
        Self::F1,
        Self::F2,
        Self::F3,
        Self::F4,
        Self::F5,
        Self::F6,
        Self::F7,
        Self::F8,
        Self::F9,
        Self::F10,
        Self::F11,
        Self::F12,
        Self::PrintScreen,
        Self::ScrollLock,
        Self::Pause,
    ];

    pub fn index(self) -> u32 {
        self as u32
    }

    pub fn bit(self) -> u32 {
        1 << self.index()
    }

    /// Identifiant partagé avec le front (`F1`, `PrintScreen`...).
    pub fn id(self) -> &'static str {
        match self {
            Self::F1 => "F1",
            Self::F2 => "F2",
            Self::F3 => "F3",
            Self::F4 => "F4",
            Self::F5 => "F5",
            Self::F6 => "F6",
            Self::F7 => "F7",
            Self::F8 => "F8",
            Self::F9 => "F9",
            Self::F10 => "F10",
            Self::F11 => "F11",
            Self::F12 => "F12",
            Self::PrintScreen => "PrintScreen",
            Self::ScrollLock => "ScrollLock",
            Self::Pause => "Pause",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.id() == id)
    }
}

/// Masque de bits (bit `index()`) d'un ensemble de touches.
pub fn mask_of(keys: &[BlockableKey]) -> u32 {
    keys.iter().fold(0, |m, k| m | k.bit())
}

/// Touches présentes dans un masque, dans l'ordre de la bande.
pub fn keys_of(mask: u32) -> Vec<BlockableKey> {
    BlockableKey::ALL
        .into_iter()
        .filter(|k| mask & k.bit() != 0)
        .collect()
}

/// Codes `KeyboardEvent.code` des touches bloquables (et F13 à F15 sur Mac) : le
/// raccourci ne peut pas les utiliser.
pub const BLOCKABLE_CODES: [&str; 18] = [
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
    "F13",
    "F14",
    "F15",
    "PrintScreen",
    "ScrollLock",
    "Pause",
];

// ---------------------------------------------------------------- Windows

/// Virtual-key code Windows (`VK_F1`..`VK_F12`, `VK_SNAPSHOT`, `VK_SCROLL`, `VK_PAUSE`).
pub fn windows_vk(key: BlockableKey) -> u16 {
    match key {
        BlockableKey::PrintScreen => 0x2C,
        BlockableKey::ScrollLock => 0x91,
        BlockableKey::Pause => 0x13,
        f => 0x70 + f.index() as u16,
    }
}

pub fn from_windows_vk(vk: u32) -> Option<BlockableKey> {
    BlockableKey::ALL
        .into_iter()
        .find(|k| u32::from(windows_vk(*k)) == vk)
}

/// Scancode Windows (jeu 1) d'une touche de raccourci, avec l'indicateur « étendu ».
pub fn windows_scancode(code: &str) -> Option<(u16, bool)> {
    let plain = |s| Some((s, false));
    let ext = |s| Some((s, true));
    match code {
        "Escape" => plain(0x01),
        "Minus" => plain(0x0C),
        "Equal" => plain(0x0D),
        "Backspace" => plain(0x0E),
        "Tab" => plain(0x0F),
        "BracketLeft" => plain(0x1A),
        "BracketRight" => plain(0x1B),
        "Enter" => plain(0x1C),
        "Semicolon" => plain(0x27),
        "Quote" => plain(0x28),
        "Backquote" => plain(0x29),
        "Backslash" => plain(0x2B),
        "Comma" => plain(0x33),
        "Period" => plain(0x34),
        "Slash" => plain(0x35),
        "Space" => plain(0x39),
        "Numpad7" => plain(0x47),
        "Numpad8" => plain(0x48),
        "Numpad9" => plain(0x49),
        "Numpad4" => plain(0x4B),
        "Numpad5" => plain(0x4C),
        "Numpad6" => plain(0x4D),
        "Numpad1" => plain(0x4F),
        "Numpad2" => plain(0x50),
        "Numpad3" => plain(0x51),
        "Numpad0" => plain(0x52),
        "Home" => ext(0x47),
        "ArrowUp" => ext(0x48),
        "PageUp" => ext(0x49),
        "ArrowLeft" => ext(0x4B),
        "ArrowRight" => ext(0x4D),
        "End" => ext(0x4F),
        "ArrowDown" => ext(0x50),
        "PageDown" => ext(0x51),
        "Insert" => ext(0x52),
        "Delete" => ext(0x53),
        // Sur la rangée principale, scancodes jeu 1 = codes evdev.
        _ => evdev_code(code).map(|c| (c, false)),
    }
}

// ---------------------------------------------------------------- macOS

/// Keycode macOS (`kVK_F1`...). Les claviers Mac n'ont ni Impr. écran, ni Arrêt défil.,
/// ni Pause : on les remplace par F13, F14 et F15.
pub fn macos_keycode(key: BlockableKey) -> u16 {
    match key {
        BlockableKey::F1 => 0x7A,
        BlockableKey::F2 => 0x78,
        BlockableKey::F3 => 0x63,
        BlockableKey::F4 => 0x76,
        BlockableKey::F5 => 0x60,
        BlockableKey::F6 => 0x61,
        BlockableKey::F7 => 0x62,
        BlockableKey::F8 => 0x64,
        BlockableKey::F9 => 0x65,
        BlockableKey::F10 => 0x6D,
        BlockableKey::F11 => 0x67,
        BlockableKey::F12 => 0x6F,
        BlockableKey::PrintScreen => 0x69, // F13
        BlockableKey::ScrollLock => 0x6B,  // F14
        BlockableKey::Pause => 0x71,       // F15
    }
}

pub fn from_macos_keycode(code: u16) -> Option<BlockableKey> {
    BlockableKey::ALL
        .into_iter()
        .find(|k| macos_keycode(*k) == code)
}

/// Keycode macOS d'une touche de raccourci (positions ANSI).
pub fn macos_shortcut_keycode(code: &str) -> Option<u16> {
    Some(match code {
        "KeyA" => 0x00,
        "KeyS" => 0x01,
        "KeyD" => 0x02,
        "KeyF" => 0x03,
        "KeyH" => 0x04,
        "KeyG" => 0x05,
        "KeyZ" => 0x06,
        "KeyX" => 0x07,
        "KeyC" => 0x08,
        "KeyV" => 0x09,
        "KeyB" => 0x0B,
        "KeyQ" => 0x0C,
        "KeyW" => 0x0D,
        "KeyE" => 0x0E,
        "KeyR" => 0x0F,
        "KeyY" => 0x10,
        "KeyT" => 0x11,
        "Digit1" => 0x12,
        "Digit2" => 0x13,
        "Digit3" => 0x14,
        "Digit4" => 0x15,
        "Digit6" => 0x16,
        "Digit5" => 0x17,
        "Equal" => 0x18,
        "Digit9" => 0x19,
        "Digit7" => 0x1A,
        "Minus" => 0x1B,
        "Digit8" => 0x1C,
        "Digit0" => 0x1D,
        "BracketRight" => 0x1E,
        "KeyO" => 0x1F,
        "KeyU" => 0x20,
        "BracketLeft" => 0x21,
        "KeyI" => 0x22,
        "KeyP" => 0x23,
        "Enter" => 0x24,
        "KeyL" => 0x25,
        "KeyJ" => 0x26,
        "Quote" => 0x27,
        "KeyK" => 0x28,
        "Semicolon" => 0x29,
        "Backslash" => 0x2A,
        "Comma" => 0x2B,
        "Slash" => 0x2C,
        "KeyN" => 0x2D,
        "KeyM" => 0x2E,
        "Period" => 0x2F,
        "Tab" => 0x30,
        "Space" => 0x31,
        "Backquote" => 0x32,
        "Backspace" => 0x33,
        "Escape" => 0x35,
        "Numpad0" => 0x52,
        "Numpad1" => 0x53,
        "Numpad2" => 0x54,
        "Numpad3" => 0x55,
        "Numpad4" => 0x56,
        "Numpad5" => 0x57,
        "Numpad6" => 0x58,
        "Numpad7" => 0x59,
        "Numpad8" => 0x5B,
        "Numpad9" => 0x5C,
        "Insert" => 0x72,
        "Home" => 0x73,
        "PageUp" => 0x74,
        "Delete" => 0x75,
        "End" => 0x77,
        "PageDown" => 0x79,
        "ArrowLeft" => 0x7B,
        "ArrowRight" => 0x7C,
        "ArrowDown" => 0x7D,
        "ArrowUp" => 0x7E,
        _ => return None,
    })
}

// ---------------------------------------------------------------- Linux

/// Code evdev (`KEY_F1`...) d'une touche bloquable. Sous X11, keycode = evdev + 8.
pub fn evdev_key(key: BlockableKey) -> u16 {
    match key {
        BlockableKey::F11 => 87,
        BlockableKey::F12 => 88,
        BlockableKey::PrintScreen => 99, // KEY_SYSRQ
        BlockableKey::ScrollLock => 70,
        BlockableKey::Pause => 119,
        f => 59 + f.index() as u16, // KEY_F1 = 59 ... KEY_F10 = 68
    }
}

pub fn from_evdev_key(code: u16) -> Option<BlockableKey> {
    BlockableKey::ALL
        .into_iter()
        .find(|k| evdev_key(*k) == code)
}

/// Décalage entre codes evdev et keycodes X11.
pub const X11_KEYCODE_OFFSET: u16 = 8;

/// Code evdev d'une touche de raccourci.
pub fn evdev_code(code: &str) -> Option<u16> {
    const LETTERS: [(char, u16); 26] = [
        ('Q', 16),
        ('W', 17),
        ('E', 18),
        ('R', 19),
        ('T', 20),
        ('Y', 21),
        ('U', 22),
        ('I', 23),
        ('O', 24),
        ('P', 25),
        ('A', 30),
        ('S', 31),
        ('D', 32),
        ('F', 33),
        ('G', 34),
        ('H', 35),
        ('J', 36),
        ('K', 37),
        ('L', 38),
        ('Z', 44),
        ('X', 45),
        ('C', 46),
        ('V', 47),
        ('B', 48),
        ('N', 49),
        ('M', 50),
    ];
    if let Some(l) = code.strip_prefix("Key") {
        let mut chars = l.chars();
        let (Some(c), None) = (chars.next(), chars.next()) else {
            return None;
        };
        return LETTERS.iter().find(|(x, _)| *x == c).map(|(_, v)| *v);
    }
    if let Some(d) = code.strip_prefix("Digit") {
        let n: u16 = d.parse().ok().filter(|n| *n <= 9)?;
        return Some(if n == 0 { 11 } else { n + 1 });
    }
    Some(match code {
        "Escape" => 1,
        "Minus" => 12,
        "Equal" => 13,
        "Backspace" => 14,
        "Tab" => 15,
        "BracketLeft" => 26,
        "BracketRight" => 27,
        "Enter" => 28,
        "Semicolon" => 39,
        "Quote" => 40,
        "Backquote" => 41,
        "Backslash" => 43,
        "Comma" => 51,
        "Period" => 52,
        "Slash" => 53,
        "Space" => 57,
        "Numpad7" => 71,
        "Numpad8" => 72,
        "Numpad9" => 73,
        "Numpad4" => 75,
        "Numpad5" => 76,
        "Numpad6" => 77,
        "Numpad1" => 79,
        "Numpad2" => 80,
        "Numpad3" => 81,
        "Numpad0" => 82,
        "Home" => 102,
        "ArrowUp" => 103,
        "PageUp" => 104,
        "ArrowLeft" => 105,
        "ArrowRight" => 106,
        "End" => 107,
        "ArrowDown" => 108,
        "PageDown" => 109,
        "Insert" => 110,
        "Delete" => 111,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_round_trip() {
        for k in BlockableKey::ALL {
            assert_eq!(BlockableKey::from_id(k.id()), Some(k));
            let json = serde_json::to_string(&k).unwrap();
            assert_eq!(json, format!("\"{}\"", k.id()));
        }
        assert_eq!(BlockableKey::from_id("F13"), None);
    }

    #[test]
    fn mask_round_trip() {
        let keys = vec![BlockableKey::F1, BlockableKey::F12, BlockableKey::Pause];
        let mask = mask_of(&keys);
        assert_eq!(mask, 1 | (1 << 11) | (1 << 14));
        assert_eq!(keys_of(mask), keys);
        assert_eq!(keys_of(mask_of(&BlockableKey::ALL)).len(), 15);
    }

    #[test]
    fn windows_virtual_keys() {
        assert_eq!(windows_vk(BlockableKey::F1), 0x70); // VK_F1
        assert_eq!(windows_vk(BlockableKey::F12), 0x7B); // VK_F12
        assert_eq!(windows_vk(BlockableKey::PrintScreen), 0x2C); // VK_SNAPSHOT
        assert_eq!(windows_vk(BlockableKey::ScrollLock), 0x91); // VK_SCROLL
        assert_eq!(windows_vk(BlockableKey::Pause), 0x13); // VK_PAUSE
        for k in BlockableKey::ALL {
            assert_eq!(from_windows_vk(u32::from(windows_vk(k))), Some(k));
        }
        assert_eq!(from_windows_vk(0x41), None); // A
    }

    #[test]
    fn windows_scancodes() {
        assert_eq!(windows_scancode("KeyK"), Some((0x25, false)));
        assert_eq!(windows_scancode("KeyQ"), Some((0x10, false)));
        assert_eq!(windows_scancode("Digit1"), Some((0x02, false)));
        assert_eq!(windows_scancode("ArrowUp"), Some((0x48, true)));
        assert_eq!(windows_scancode("Numpad8"), Some((0x48, false)));
        assert_eq!(windows_scancode("F1"), None);
    }

    #[test]
    fn macos_keycodes() {
        assert_eq!(macos_keycode(BlockableKey::F1), 0x7A); // kVK_F1
        assert_eq!(macos_keycode(BlockableKey::F5), 0x60); // kVK_F5
        assert_eq!(macos_keycode(BlockableKey::PrintScreen), 0x69); // kVK_F13
        assert_eq!(macos_keycode(BlockableKey::Pause), 0x71); // kVK_F15
        let mut seen = std::collections::HashSet::new();
        for k in BlockableKey::ALL {
            assert!(seen.insert(macos_keycode(k)), "keycode en double");
            assert_eq!(from_macos_keycode(macos_keycode(k)), Some(k));
        }
        assert_eq!(macos_shortcut_keycode("KeyK"), Some(0x28)); // kVK_ANSI_K
        assert_eq!(macos_shortcut_keycode("F13"), None);
    }

    #[test]
    fn evdev_codes() {
        assert_eq!(evdev_key(BlockableKey::F1), 59);
        assert_eq!(evdev_key(BlockableKey::F10), 68);
        assert_eq!(evdev_key(BlockableKey::F11), 87);
        assert_eq!(evdev_key(BlockableKey::PrintScreen), 99);
        for k in BlockableKey::ALL {
            assert_eq!(from_evdev_key(evdev_key(k)), Some(k));
        }
        assert_eq!(evdev_code("KeyK"), Some(37));
        assert_eq!(evdev_code("KeyA"), Some(30));
        assert_eq!(evdev_code("Digit0"), Some(11));
        assert_eq!(evdev_code("Digit1"), Some(2));
        assert_eq!(evdev_code("KeyAB"), None);
        assert_eq!(evdev_code("Digit10"), None);
    }

    #[test]
    fn shortcut_tables_agree_on_supported_keys() {
        // Toute touche utilisable dans un raccourci existe sur les 3 OS.
        let codes = [
            "KeyA",
            "KeyK",
            "KeyZ",
            "Digit0",
            "Digit9",
            "Space",
            "Enter",
            "Tab",
            "Minus",
            "Equal",
            "Comma",
            "Period",
            "Slash",
            "Backquote",
            "ArrowLeft",
            "Home",
            "Delete",
            "Numpad5",
        ];
        for c in codes {
            assert!(windows_scancode(c).is_some(), "{c} Windows");
            assert!(macos_shortcut_keycode(c).is_some(), "{c} macOS");
            assert!(evdev_code(c).is_some(), "{c} Linux");
        }
        for c in BLOCKABLE_CODES {
            assert!(evdev_code(c).is_none(), "{c} ne doit pas être utilisable");
        }
    }
}
