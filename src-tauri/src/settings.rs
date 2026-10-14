//! Réglages persistés dans le store (`settings.json` dans le dossier de données de l'app).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::keyguard::keys::BlockableKey;
use crate::shortcut::Shortcut;

pub const STORE_FILE: &str = "settings.json";
pub const PREFS_KEY: &str = "prefs";
pub const TOTAL_KEY: &str = "total";

pub const DEFAULT_SKIN: &str = "noir";
pub const DEFAULT_ACCENT: &str = "#ff9548";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePref {
    #[default]
    System,
    Light,
    Dark,
}

/// Tout ce qui est persisté, sauf le compteur (écrit à part, de façon groupée).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Prefs {
    /// Touches sélectionnées (par défaut : toutes).
    pub blocked: Vec<BlockableKey>,
    /// Protection active (mode F-keys) ou en pause.
    pub active: bool,
    pub shortcut: Shortcut,
    pub skin: String,
    pub accent: String,
    pub theme: ThemePref,
    pub autostart: bool,
    /// macOS : bloquer aussi les fonctions média de la rangée du haut.
    pub media_keys: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            blocked: BlockableKey::ALL.to_vec(),
            active: true,
            shortcut: Shortcut::default(),
            skin: DEFAULT_SKIN.into(),
            accent: DEFAULT_ACCENT.into(),
            theme: ThemePref::System,
            autostart: false,
            media_keys: true,
        }
    }
}

fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn is_skin_id(s: &str) -> bool {
    (1..=24).contains(&s.len()) && s.chars().all(|c| c.is_ascii_lowercase() || c == '-')
}

impl Prefs {
    /// Lit les réglages, en gardant les valeurs par défaut pour tout ce qui est absent
    /// ou invalide (fichier abîmé, ancienne version...).
    pub fn from_json(value: Option<&Value>) -> Self {
        let mut p: Prefs = value
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        p.sanitize();
        p
    }

    pub fn sanitize(&mut self) {
        let d = Prefs::default();
        self.blocked.sort();
        self.blocked.dedup();
        if self.shortcut.validate().is_err() {
            self.shortcut = d.shortcut;
        }
        if !is_skin_id(&self.skin) {
            self.skin = d.skin;
        }
        if !is_hex_color(&self.accent) {
            self.accent = d.accent;
        } else {
            self.accent = self.accent.to_ascii_lowercase();
        }
    }
}

/// Modification partielle des réglages d'apparence, envoyée par l'écran Réglages.
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub skin: Option<String>,
    pub accent: Option<String>,
    pub theme: Option<ThemePref>,
    pub autostart: Option<bool>,
    pub media_keys: Option<bool>,
}

impl SettingsPatch {
    /// Applique la modification ; les valeurs invalides sont ignorées.
    pub fn apply_to(self, p: &mut Prefs) {
        if let Some(s) = self.skin.filter(|s| is_skin_id(s)) {
            p.skin = s;
        }
        if let Some(a) = self.accent.filter(|a| is_hex_color(a)) {
            p.accent = a.to_ascii_lowercase();
        }
        if let Some(t) = self.theme {
            p.theme = t;
        }
        if let Some(a) = self.autostart {
            p.autostart = a;
        }
        if let Some(m) = self.media_keys {
            p.media_keys = m;
        }
    }
}

/// Lit le compteur total ; toute valeur illisible vaut 0.
pub fn total_from_json(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_block_everything_and_are_active() {
        let p = Prefs::from_json(None);
        assert_eq!(p.blocked.len(), 15);
        assert!(p.active);
        assert_eq!(p.skin, "noir");
        assert_eq!(p.accent, "#ff9548");
        assert_eq!(p.theme, ThemePref::System);
        assert!(p.media_keys);
    }

    #[test]
    fn round_trips_through_json() {
        let mut p = Prefs {
            blocked: vec![BlockableKey::F1, BlockableKey::Pause],
            active: false,
            skin: "siamois".into(),
            accent: "#8fb0ff".into(),
            theme: ThemePref::Dark,
            autostart: true,
            ..Prefs::default()
        };
        p.shortcut.shift = true;
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["mediaKeys"], json!(true));
        assert_eq!(Prefs::from_json(Some(&v)), p);
    }

    #[test]
    fn invalid_values_fall_back_to_defaults() {
        let v = json!({
            "blocked": ["F1", "F1", "F3"],
            "skin": "<script>",
            "accent": "red",
            "shortcut": { "ctrl": true, "alt": true, "shift": false, "meta": false, "key": "F5" },
            "theme": "dark"
        });
        let p = Prefs::from_json(Some(&v));
        assert_eq!(p.blocked, vec![BlockableKey::F1, BlockableKey::F3]);
        assert_eq!(p.skin, "noir");
        assert_eq!(p.accent, "#ff9548");
        assert_eq!(p.shortcut, Shortcut::default());
        assert_eq!(p.theme, ThemePref::Dark);
        // Champs absents : valeurs par défaut.
        assert!(p.active);
    }

    #[test]
    fn unreadable_file_gives_defaults() {
        assert_eq!(Prefs::from_json(Some(&json!("abîmé"))), Prefs::default());
        assert_eq!(
            Prefs::from_json(Some(&json!({"blocked": "F1"}))),
            Prefs::default()
        );
    }

    #[test]
    fn patch_ignores_invalid_values() {
        let mut p = Prefs::default();
        SettingsPatch {
            skin: Some("roux".into()),
            accent: Some("#7FD1A8".into()),
            ..Default::default()
        }
        .apply_to(&mut p);
        assert_eq!(p.skin, "roux");
        assert_eq!(p.accent, "#7fd1a8");
        SettingsPatch {
            skin: Some("../../etc".into()),
            accent: Some("url(x)".into()),
            ..Default::default()
        }
        .apply_to(&mut p);
        assert_eq!(p.skin, "roux");
        assert_eq!(p.accent, "#7fd1a8");
    }

    #[test]
    fn total_is_read_safely() {
        assert_eq!(total_from_json(Some(&json!(1284))), 1284);
        assert_eq!(total_from_json(Some(&json!(-3))), 0);
        assert_eq!(total_from_json(Some(&json!("12"))), 0);
        assert_eq!(total_from_json(None), 0);
    }
}
