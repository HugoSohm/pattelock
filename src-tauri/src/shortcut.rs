//! Raccourci global on/off : représentation, validation et conversion.

use serde::{Deserialize, Serialize};

use crate::keyguard::keys::{
    evdev_code, is_blockable_code, macos_shortcut_keycode, windows_scancode,
};

/// Combinaison de touches. `key` est un `KeyboardEvent.code` (position physique),
/// `label` le libellé de la touche sur le clavier de l'utilisateur, s'il est connu.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Shortcut {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl Default for Shortcut {
    /// `Ctrl+Alt+K` sur Windows et Linux, `Cmd+Option+K` sur macOS.
    fn default() -> Self {
        let mac = cfg!(target_os = "macos");
        Self {
            ctrl: !mac,
            alt: true,
            shift: false,
            meta: mac,
            key: "KeyK".into(),
            label: None,
        }
    }
}

const MODIFIER_CODES: [&str; 10] = [
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
    "MetaLeft",
    "MetaRight",
    "OSLeft",
    "OSRight",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutError {
    MissingKey,
    MissingModifier,
    Blockable,
    Unsupported,
    /// Le système (ou une autre app) utilise déjà cette combinaison.
    Taken,
}

impl ShortcutError {
    /// Code envoyé au front, qui affiche le message dans la langue de l'UI.
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingKey => "missingKey",
            Self::MissingModifier => "missingModifier",
            Self::Blockable => "blockable",
            Self::Unsupported => "unsupported",
            Self::Taken => "taken",
        }
    }
}

impl Shortcut {
    pub fn validate(&self) -> Result<(), ShortcutError> {
        if self.key.is_empty() || MODIFIER_CODES.contains(&self.key.as_str()) {
            return Err(ShortcutError::MissingKey);
        }
        if is_blockable_code(&self.key) {
            return Err(ShortcutError::Blockable);
        }
        if !(self.ctrl || self.alt || self.meta) {
            return Err(ShortcutError::MissingModifier);
        }
        let supported = windows_scancode(&self.key).is_some()
            && macos_shortcut_keycode(&self.key).is_some()
            && evdev_code(&self.key).is_some();
        if !supported {
            return Err(ShortcutError::Unsupported);
        }
        Ok(())
    }

    /// Touche transmise au plugin. Sous Windows et X11, le plugin traduit `KeyQ` selon la
    /// disposition (caractère Q), alors que le hook raisonne en position physique : on
    /// lui passe donc le caractère réellement imprimé sur la touche (`A` sur la position
    /// `KeyQ` d'un AZERTY). Le Mac travaille déjà en positions physiques. Le pavé numérique
    /// et les autres touches ne dépendent pas de la disposition : on garde leur code.
    pub fn plugin_key(&self, mac: bool) -> String {
        let main_block = self.key.starts_with("Key") || self.key.starts_with("Digit");
        if !mac && main_block {
            if let Some(c) = self.label.as_deref().and_then(single_char) {
                if c.is_ascii_alphabetic() {
                    return format!("Key{}", c.to_ascii_uppercase());
                }
                if c.is_ascii_digit() {
                    return format!("Digit{c}");
                }
            }
        }
        self.key.clone()
    }

    /// Chaîne attendue par le plugin global-shortcut (ex. `control+alt+KeyK`).
    pub fn accelerator(&self) -> String {
        self.accelerator_for(cfg!(target_os = "macos"))
    }

    fn accelerator_for(&self, mac: bool) -> String {
        let key = self.plugin_key(mac);
        let mut parts: Vec<&str> = Vec::new();
        if self.ctrl {
            parts.push("control");
        }
        if self.alt {
            parts.push("alt");
        }
        if self.shift {
            parts.push("shift");
        }
        if self.meta {
            parts.push("super");
        }
        parts.push(&key);
        parts.join("+")
    }
}

fn single_char(s: &str) -> Option<char> {
    let mut chars = s.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) => Some(c),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sc(ctrl: bool, alt: bool, shift: bool, meta: bool, key: &str) -> Shortcut {
        Shortcut {
            ctrl,
            alt,
            shift,
            meta,
            key: key.into(),
            label: None,
        }
    }

    #[test]
    fn default_is_valid_and_platform_specific() {
        let d = Shortcut::default();
        assert_eq!(d.validate(), Ok(()));
        assert_eq!(d.key, "KeyK");
        assert!(d.alt);
        if cfg!(target_os = "macos") {
            assert!(d.meta && !d.ctrl);
            assert_eq!(d.accelerator(), "alt+super+KeyK");
        } else {
            assert!(d.ctrl && !d.meta);
            assert_eq!(d.accelerator(), "control+alt+KeyK");
        }
    }

    #[test]
    fn rejects_blockable_keys() {
        for key in [
            "F1",
            "F5",
            "F12",
            "F13",
            "PrintScreen",
            "ScrollLock",
            "Pause",
            "Numpad5",
            "NumpadEnter",
            "NumLock",
        ] {
            assert_eq!(
                sc(true, true, false, false, key).validate(),
                Err(ShortcutError::Blockable),
                "{key}"
            );
        }
    }

    #[test]
    fn requires_a_real_modifier() {
        assert_eq!(
            sc(false, false, false, false, "KeyK").validate(),
            Err(ShortcutError::MissingModifier)
        );
        assert_eq!(
            sc(false, false, true, false, "KeyK").validate(),
            Err(ShortcutError::MissingModifier)
        );
        assert_eq!(sc(false, true, true, false, "KeyK").validate(), Ok(()));
    }

    #[test]
    fn requires_a_main_key() {
        assert_eq!(
            sc(true, true, false, false, "AltLeft").validate(),
            Err(ShortcutError::MissingKey)
        );
        assert_eq!(
            sc(true, true, false, false, "").validate(),
            Err(ShortcutError::MissingKey)
        );
    }

    #[test]
    fn rejects_unknown_keys() {
        assert_eq!(
            sc(true, true, false, false, "MediaPlayPause").validate(),
            Err(ShortcutError::Unsupported)
        );
    }

    #[test]
    fn accelerator_lists_all_modifiers() {
        assert_eq!(
            sc(true, true, true, true, "Digit1").accelerator(),
            "control+alt+shift+super+Digit1"
        );
    }

    #[test]
    fn plugin_key_follows_the_printed_character() {
        // AZERTY : la position physique KeyQ porte la lettre A.
        let mut s = sc(true, true, false, false, "KeyQ");
        s.label = Some("A".into());
        assert_eq!(s.accelerator_for(false), "control+alt+KeyA");
        // Sur Mac, le plugin raisonne en positions physiques.
        assert_eq!(s.accelerator_for(true), "control+alt+KeyQ");
        // Chiffres et libellés longs.
        s.key = "Digit1".into();
        s.label = Some("1".into());
        assert_eq!(s.plugin_key(false), "Digit1");
        s.key = "Space".into();
        s.label = Some("Espace".into());
        assert_eq!(s.plugin_key(false), "Space");
        // Libellé accentué : on garde la position physique.
        s.key = "Digit2".into();
        s.label = Some("É".into());
        assert_eq!(s.plugin_key(false), "Digit2");
        // Pavé numérique : le libellé « 5 » ne doit pas devenir la touche 5 du haut.
        s.key = "Numpad5".into();
        s.label = Some("5".into());
        assert_eq!(s.plugin_key(false), "Numpad5");
    }

    #[test]
    fn error_codes_match_front() {
        assert_eq!(ShortcutError::MissingModifier.code(), "missingModifier");
        assert_eq!(ShortcutError::Taken.code(), "taken");
    }

    #[test]
    fn json_shape_matches_front() {
        let json = serde_json::to_value(sc(true, true, false, false, "KeyK")).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"ctrl": true, "alt": true, "shift": false, "meta": false, "key": "KeyK"})
        );
    }
}
