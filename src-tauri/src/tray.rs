//! Icône dans la barre des tâches (Windows, Linux) ou la barre de menus (macOS).
//!
//! L'icône montre le chat endormi (protection active) ou éveillé (pause). Elle suit le
//! thème du système, pas celui de l'app : image « template » sur macOS (le système la
//! colore), variante claire ou sombre selon la barre des tâches sous Windows.

use std::sync::Arc;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::core::Core;
use crate::state::{Action, Mode};

const TRAY_ID: &str = "main";

pub struct TrayItems {
    cat: MenuItem<Wry>,
    lock: MenuItem<Wry>,
}

/// Variante d'icône à utiliser pour la barre du système.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Variant {
    /// Barre claire : chat sombre.
    Light,
    /// Barre sombre : chat clair.
    Dark,
    /// macOS : seule l'opacité compte.
    Template,
}

fn variant() -> Variant {
    if cfg!(target_os = "macos") {
        Variant::Template
    } else if system_dark() {
        Variant::Dark
    } else {
        Variant::Light
    }
}

/// Barre des tâches Windows en thème sombre ? (`SystemUsesLightTheme`, distinct du
/// thème des applications.)
#[cfg(windows)]
fn system_dark() -> bool {
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    // SAFETY : tampon de 4 octets pour une valeur DWORD.
    let res = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut value as *mut u32).cast()),
            Some(&mut size),
        )
    };
    // Valeur absente (anciennes versions) : barre sombre, comme Windows 10 par défaut.
    res.is_err() || value == 0
}

/// Linux : la plupart des barres (GNOME, KDE par défaut) sont sombres.
#[cfg(not(windows))]
fn system_dark() -> bool {
    true
}

fn icon(mode: Mode, v: Variant) -> Option<Image<'static>> {
    let asleep = mode != Mode::Off;
    let bytes: &'static [u8] = match (asleep, v) {
        (true, Variant::Light) => include_bytes!("../icons/tray/sleep-light.png"),
        (true, Variant::Dark) => include_bytes!("../icons/tray/sleep-dark.png"),
        (true, Variant::Template) => include_bytes!("../icons/tray/sleep-template.png"),
        (false, Variant::Light) => include_bytes!("../icons/tray/awake-light.png"),
        (false, Variant::Dark) => include_bytes!("../icons/tray/awake-dark.png"),
        (false, Variant::Template) => include_bytes!("../icons/tray/awake-template.png"),
    };
    match Image::from_bytes(bytes) {
        Ok(img) => Some(img),
        Err(e) => {
            log::error!("icône du tray illisible : {e}");
            None
        }
    }
}

/// Textes du menu selon le mode.
pub fn labels(mode: Mode) -> (&'static str, &'static str, &'static str) {
    let cat = if mode == Mode::Off {
        "Endormir le chat"
    } else {
        "Réveiller le chat"
    };
    let lock = if mode == Mode::All {
        "Déverrouiller tout le clavier"
    } else {
        "Verrouiller tout le clavier"
    };
    let tooltip = match mode {
        Mode::Off => "Pattelock : en pause",
        Mode::Fkeys => "Pattelock : blocage en cours",
        Mode::All => "Pattelock : clavier entier verrouillé",
    };
    (cat, lock, tooltip)
}

fn with_core(app: &AppHandle, f: impl FnOnce(&Core)) {
    if let Some(core) = app.try_state::<Arc<Core>>() {
        f(&core);
    }
}

pub fn create(app: &AppHandle, mode: Mode) -> tauri::Result<()> {
    let (cat_label, lock_label, tooltip) = labels(mode);
    let cat = MenuItem::with_id(app, "cat", cat_label, true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", lock_label, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Ouvrir", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&cat, &lock, &separator, &open, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip)
        // Sur Mac, un clic ouvre le menu ; ailleurs, le clic gauche ouvre la fenêtre.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .icon_as_template(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "cat" => with_core(app, |c| c.act(Action::Cat)),
            "lock" => with_core(app, |c| c.act(Action::LockAll)),
            "open" => crate::window::show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window::show_main(tray.app_handle());
            }
        });
    if let Some(img) = icon(mode, variant()) {
        builder = builder.icon(img);
    }
    builder.build(app)?;
    app.manage(TrayItems { cat, lock });
    Ok(())
}

/// Met à jour icône, infobulle et menu après un changement de mode ou de thème.
pub fn refresh(app: &AppHandle, mode: Mode) {
    let (cat_label, lock_label, tooltip) = labels(mode);
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.cat.set_text(cat_label);
        let _ = items.lock.set_text(lock_label);
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_icon(icon(mode, variant()));
        let _ = tray.set_icon_as_template(cfg!(target_os = "macos"));
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_labels_follow_the_mode() {
        assert_eq!(labels(Mode::Off).0, "Endormir le chat");
        assert_eq!(labels(Mode::Fkeys).0, "Réveiller le chat");
        assert_eq!(labels(Mode::All).0, "Réveiller le chat");
        assert_eq!(labels(Mode::All).1, "Déverrouiller tout le clavier");
        assert_eq!(labels(Mode::Fkeys).1, "Verrouiller tout le clavier");
    }

    #[test]
    fn every_icon_decodes() {
        for mode in [Mode::Off, Mode::Fkeys] {
            for v in [Variant::Light, Variant::Dark, Variant::Template] {
                assert!(icon(mode, v).is_some(), "{mode:?} {v:?}");
            }
        }
    }
}
