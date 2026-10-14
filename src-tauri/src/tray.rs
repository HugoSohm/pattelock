//! Icône dans la barre des tâches (Windows, Linux) ou la barre de menus (macOS).
//!
//! L'icône est la patte de Pattelock, comme le badge de l'app : orange quand le blocage
//! est actif, grise en pause. Son liseré encre la rend lisible sur une barre claire comme
//! sur une barre sombre, sur tous les OS.

use std::sync::Arc;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::core::Core;
use crate::settings::Lang;
use crate::state::{Action, Mode};

const TRAY_ID: &str = "main";

pub struct TrayItems {
    cat: MenuItem<Wry>,
    lock: MenuItem<Wry>,
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn icon(mode: Mode) -> Option<Image<'static>> {
    let bytes: &'static [u8] = if mode == Mode::Off {
        include_bytes!("../icons/tray/paused.png")
    } else {
        include_bytes!("../icons/tray/active.png")
    };
    match Image::from_bytes(bytes) {
        Ok(img) => Some(img),
        Err(e) => {
            log::error!("icône du tray illisible : {e}");
            None
        }
    }
}

/// Textes du menu et de l'infobulle.
pub struct Labels {
    pub cat: &'static str,
    pub lock: &'static str,
    pub open: &'static str,
    pub quit: &'static str,
    pub tooltip: &'static str,
}

/// Textes du menu selon le mode et la langue de l'UI.
pub fn labels(mode: Mode, lang: Lang) -> Labels {
    let off = mode == Mode::Off;
    let all = mode == Mode::All;
    match lang {
        Lang::Fr => Labels {
            cat: if off {
                "Endormir le chat"
            } else {
                "Réveiller le chat"
            },
            lock: if all {
                "Déverrouiller tout le clavier"
            } else {
                "Verrouiller tout le clavier"
            },
            open: "Ouvrir",
            quit: "Quitter",
            tooltip: match mode {
                Mode::Off => "Pattelock : en pause",
                Mode::Fkeys => "Pattelock : blocage en cours",
                Mode::All => "Pattelock : clavier entier verrouillé",
            },
        },
        Lang::En => Labels {
            cat: if off {
                "Put the cat to sleep"
            } else {
                "Wake the cat up"
            },
            lock: if all {
                "Unlock the whole keyboard"
            } else {
                "Lock the whole keyboard"
            },
            open: "Open",
            quit: "Quit",
            tooltip: match mode {
                Mode::Off => "Pattelock: paused",
                Mode::Fkeys => "Pattelock: blocking on",
                Mode::All => "Pattelock: whole keyboard locked",
            },
        },
    }
}

fn with_core(app: &AppHandle, f: impl FnOnce(&Core)) {
    if let Some(core) = app.try_state::<Arc<Core>>() {
        f(&core);
    }
}

pub fn create(app: &AppHandle, mode: Mode, lang: Lang) -> tauri::Result<()> {
    let l = labels(mode, lang);
    let cat = MenuItem::with_id(app, "cat", l.cat, true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", l.lock, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", l.open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", l.quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&cat, &lock, &separator, &open, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(l.tooltip)
        // Sur Mac, un clic ouvre le menu ; ailleurs, le clic gauche ouvre la fenêtre.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
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
    if let Some(img) = icon(mode) {
        builder = builder.icon(img);
    }
    builder.build(app)?;
    app.manage(TrayItems {
        cat,
        lock,
        open,
        quit,
    });
    Ok(())
}

/// Met à jour icône, infobulle et menu (changement de mode ou de langue).
pub fn refresh(app: &AppHandle, mode: Mode, lang: Lang) {
    let l = labels(mode, lang);
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.cat.set_text(l.cat);
        let _ = items.lock.set_text(l.lock);
        let _ = items.open.set_text(l.open);
        let _ = items.quit.set_text(l.quit);
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_icon(icon(mode));
        let _ = tray.set_tooltip(Some(l.tooltip));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_labels_follow_the_mode() {
        assert_eq!(labels(Mode::Off, Lang::Fr).cat, "Endormir le chat");
        assert_eq!(labels(Mode::Fkeys, Lang::Fr).cat, "Réveiller le chat");
        assert_eq!(labels(Mode::All, Lang::Fr).cat, "Réveiller le chat");
        assert_eq!(
            labels(Mode::All, Lang::Fr).lock,
            "Déverrouiller tout le clavier"
        );
        assert_eq!(
            labels(Mode::Fkeys, Lang::Fr).lock,
            "Verrouiller tout le clavier"
        );
    }

    #[test]
    fn menu_labels_are_translated() {
        assert_eq!(labels(Mode::Off, Lang::En).cat, "Put the cat to sleep");
        assert_eq!(
            labels(Mode::All, Lang::En).lock,
            "Unlock the whole keyboard"
        );
        assert_eq!(labels(Mode::Fkeys, Lang::En).quit, "Quit");
        assert_eq!(
            labels(Mode::Fkeys, Lang::En).tooltip,
            "Pattelock: blocking on"
        );
    }

    #[test]
    fn every_icon_decodes() {
        for mode in [Mode::Off, Mode::Fkeys, Mode::All] {
            assert!(icon(mode).is_some(), "{mode:?}");
        }
    }
}
