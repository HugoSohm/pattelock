//! Touches supplémentaires : touches choisies par l'utilisateur, en plus de la bande,
//! enregistrées comme le raccourci (position physique, `KeyboardEvent.code`).

use serde::{Deserialize, Serialize};

use crate::keyguard::combo::{custom_native_code, Mods};
use crate::keyguard::keys::is_blockable_code;
use crate::shortcut::Shortcut;

/// Nombre maximal de touches supplémentaires (taille du tableau lu par le hook).
pub const MAX_CUSTOM: usize = 24;

/// Libellé affiché trop long ou abîmé : on retombe sur le nom tiré du code.
const MAX_LABEL: usize = 12;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomKey {
    /// `KeyboardEvent.code` (`KeyA`, `Space`...).
    pub code: String,
    /// Caractère imprimé sur la touche dans la disposition de l'utilisateur, s'il est connu.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CustomKeyError {
    /// Touche déjà présente sur la bande : il suffit de la cocher.
    InStrip,
    /// Touche inconnue sur cet OS (ou modificateur).
    Unsupported,
    /// Touche principale du raccourci : la bloquer empêcherait de basculer la protection.
    Shortcut,
    Duplicate,
    Full,
}

impl CustomKeyError {
    /// Code envoyé au front, qui affiche le message dans la langue de l'UI.
    pub fn code(self) -> &'static str {
        match self {
            Self::InStrip => "inStrip",
            Self::Unsupported => "unsupported",
            Self::Shortcut => "shortcut",
            Self::Duplicate => "duplicate",
            Self::Full => "full",
        }
    }
}

impl CustomKey {
    /// Code natif de la touche sur l'OS courant.
    pub fn native(&self) -> Option<u32> {
        custom_native_code(&self.code)
    }

    /// La touche peut-elle être bloquée, seule, avec ce raccourci ?
    fn check(&self, shortcut: &Shortcut) -> Result<(), CustomKeyError> {
        if is_blockable_code(&self.code) {
            return Err(CustomKeyError::InStrip);
        }
        if self.native().is_none() {
            return Err(CustomKeyError::Unsupported);
        }
        if self.used_by(shortcut) {
            return Err(CustomKeyError::Shortcut);
        }
        Ok(())
    }

    /// La touche fait-elle partie du raccourci (touche principale, ou modificateur du même
    /// groupe : Ctrl droit pour un raccourci avec Ctrl) ? La bloquer empêcherait de
    /// basculer la protection.
    pub fn used_by(&self, shortcut: &Shortcut) -> bool {
        self.code == shortcut.key
            || modifier_group(&self.code) & Mods::from_shortcut(shortcut).0 != 0
    }

    fn clean_label(&mut self) {
        let ok = self.label.as_deref().is_some_and(|l| {
            let n = l.chars().count();
            (1..=MAX_LABEL).contains(&n) && !l.chars().any(char::is_control)
        });
        if !ok {
            self.label = None;
        }
    }
}

/// Groupe de modificateurs d'une touche (0 si ce n'est pas un modificateur).
fn modifier_group(code: &str) -> u8 {
    match code {
        "ShiftLeft" | "ShiftRight" => Mods::SHIFT,
        "ControlLeft" | "ControlRight" => Mods::CTRL,
        "AltLeft" | "AltRight" => Mods::ALT,
        "MetaLeft" | "MetaRight" => Mods::META,
        _ => 0,
    }
}

/// Une des touches ajoutées sert-elle au raccourci ?
pub fn conflicts_with(list: &[CustomKey], shortcut: &Shortcut) -> bool {
    list.iter().any(|k| k.used_by(shortcut))
}

/// Ajoute une touche à la liste, si elle est valable.
pub fn add(
    list: &mut Vec<CustomKey>,
    mut key: CustomKey,
    shortcut: &Shortcut,
) -> Result<(), CustomKeyError> {
    key.check(shortcut)?;
    if list.iter().any(|k| k.code == key.code) {
        return Err(CustomKeyError::Duplicate);
    }
    if list.len() >= MAX_CUSTOM {
        return Err(CustomKeyError::Full);
    }
    key.clean_label();
    list.push(key);
    Ok(())
}

/// Retire tout ce qui n'est pas valable (fichier abîmé, autre OS, raccourci changé...).
pub fn sanitize(list: &mut Vec<CustomKey>, shortcut: &Shortcut) {
    let old = std::mem::take(list);
    for key in old {
        let _ = add(list, key, shortcut);
    }
}

/// Codes natifs, pour le hook.
pub fn natives(list: &[CustomKey]) -> Vec<u32> {
    list.iter().filter_map(CustomKey::native).collect()
}

/// Codes `KeyboardEvent.code` des touches dont le code natif figure dans `natives`.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn codes_of(list: &[CustomKey], natives: &[u32]) -> Vec<String> {
    list.iter()
        .filter(|k| k.native().is_some_and(|n| natives.contains(&n)))
        .map(|k| k.code.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: &str) -> CustomKey {
        CustomKey {
            code: code.into(),
            label: None,
        }
    }

    #[test]
    fn adds_valid_keys_and_rejects_the_rest() {
        let sc = Shortcut::default();
        let mut list = Vec::new();
        assert_eq!(add(&mut list, key("KeyA"), &sc), Ok(()));
        assert_eq!(add(&mut list, key("Space"), &sc), Ok(()));
        assert_eq!(add(&mut list, key("IntlBackslash"), &sc), Ok(()));
        assert_eq!(
            add(&mut list, key("KeyA"), &sc),
            Err(CustomKeyError::Duplicate)
        );
        assert_eq!(add(&mut list, key("F5"), &sc), Err(CustomKeyError::InStrip));
        assert_eq!(
            add(&mut list, key("Numpad5"), &sc),
            Err(CustomKeyError::InStrip)
        );
        assert_eq!(
            add(&mut list, key("FnLock"), &sc),
            Err(CustomKeyError::Unsupported)
        );
        assert_eq!(
            add(&mut list, key("MediaPlayPause"), &sc),
            Err(CustomKeyError::Unsupported)
        );
        assert_eq!(
            add(&mut list, key(&sc.key), &sc),
            Err(CustomKeyError::Shortcut)
        );
        assert_eq!(list.len(), 3);
        assert_eq!(natives(&list).len(), 3);
    }

    #[test]
    fn modifiers_are_allowed_unless_the_shortcut_uses_them() {
        // Ctrl + Alt + K.
        let sc = Shortcut {
            ctrl: true,
            alt: true,
            shift: false,
            meta: false,
            key: "KeyK".into(),
            label: None,
        };
        let mut list = Vec::new();
        for code in [
            "ShiftLeft",
            "ShiftRight",
            "MetaLeft",
            "MetaRight",
            "CapsLock",
        ] {
            assert_eq!(add(&mut list, key(code), &sc), Ok(()), "{code}");
        }
        for code in ["ControlLeft", "ControlRight", "AltLeft", "AltRight"] {
            assert_eq!(
                add(&mut list, key(code), &sc),
                Err(CustomKeyError::Shortcut),
                "{code}"
            );
        }
        assert!(!conflicts_with(&list, &sc));
        // Un raccourci qui utiliserait Maj ou la touche ajoutée entre en conflit.
        let mut with_shift = sc.clone();
        with_shift.shift = true;
        assert!(conflicts_with(&list, &with_shift));
        let mut on_a = sc.clone();
        on_a.key = "KeyA".into();
        assert!(!conflicts_with(&list, &on_a));
        list.push(key("KeyA"));
        assert!(conflicts_with(&list, &on_a));
    }

    #[test]
    fn list_is_capped() {
        let sc = Shortcut::default();
        let mut list = Vec::new();
        let codes = (b'A'..=b'Z')
            .map(|c| format!("Key{}", c as char))
            .filter(|c| *c != sc.key);
        for c in codes.take(MAX_CUSTOM) {
            assert_eq!(add(&mut list, key(&c), &sc), Ok(()));
        }
        assert_eq!(
            add(&mut list, key("Digit1"), &sc),
            Err(CustomKeyError::Full)
        );
    }

    #[test]
    fn labels_are_kept_only_when_sane() {
        let sc = Shortcut::default();
        let mut list = Vec::new();
        let mut a = key("KeyQ");
        a.label = Some("A".into());
        add(&mut list, a, &sc).unwrap();
        let mut b = key("KeyW");
        b.label = Some("a very long label indeed".into());
        add(&mut list, b, &sc).unwrap();
        let mut c = key("KeyE");
        c.label = Some("\u{7}".into());
        add(&mut list, c, &sc).unwrap();
        assert_eq!(list[0].label.as_deref(), Some("A"));
        assert_eq!(list[1].label, None);
        assert_eq!(list[2].label, None);
    }

    #[test]
    fn sanitize_drops_invalid_entries_and_the_shortcut_key() {
        let mut sc = Shortcut::default();
        let mut list = vec![key("KeyA"), key("KeyA"), key("F1"), key("KeyB")];
        sanitize(&mut list, &sc);
        assert_eq!(list, vec![key("KeyA"), key("KeyB")]);
        sc.key = "KeyB".into();
        sanitize(&mut list, &sc);
        assert_eq!(list, vec![key("KeyA")]);
    }

    #[test]
    fn codes_follow_natives() {
        let list = vec![key("KeyA"), key("Space")];
        let space = list[1].native().unwrap();
        assert_eq!(codes_of(&list, &[space]), vec!["Space".to_string()]);
    }

    #[test]
    fn json_shape_matches_front() {
        let mut k = key("KeyQ");
        assert_eq!(
            serde_json::to_value(&k).unwrap(),
            serde_json::json!({"code": "KeyQ"})
        );
        k.label = Some("A".into());
        assert_eq!(
            serde_json::to_value(&k).unwrap(),
            serde_json::json!({"code": "KeyQ", "label": "A"})
        );
        assert_eq!(CustomKeyError::InStrip.code(), "inStrip");
    }
}
