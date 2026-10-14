//! Linux : X11 (`XGrabKey` / `XGrabKeyboard`) ou Wayland (evdev + uinput), selon la session.
//!
//! Sous Wayland il n'existe pas d'API globale pour avaler des touches : on capture les
//! claviers au niveau du noyau (`EVIOCGRAB`) et on réémet ce qui n'est pas bloqué par un
//! clavier virtuel `uinput`. Il faut appartenir au groupe `input` et une règle udev pour
//! `/dev/uinput` (fournie dans `packaging/linux/`). Sans ces droits, l'UI affiche la
//! commande à lancer ; l'app ne plante jamais.

mod evdev;
mod x11;

use std::sync::Arc;

use super::{GuardStatus, KeyGuard, Reason, Shared};

/// Type de session graphique.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Session {
    X11,
    Wayland,
}

/// Détecte la session à partir des variables d'environnement.
pub fn detect_session(session_type: Option<&str>, wayland_display: bool, display: bool) -> Session {
    match session_type.map(str::to_ascii_lowercase).as_deref() {
        Some("wayland") => Session::Wayland,
        Some("x11") => Session::X11,
        _ if wayland_display => Session::Wayland,
        _ if display => Session::X11,
        // Console, session inconnue : evdev reste la seule option.
        _ => Session::Wayland,
    }
}

pub fn start(shared: Arc<Shared>) -> Box<dyn KeyGuard> {
    let session = detect_session(
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
        std::env::var_os("DISPLAY").is_some(),
    );
    log::info!("session Linux : {session:?}");
    match session {
        Session::X11 => match x11::start(shared.clone()) {
            Ok(guard) => guard,
            Err(reason) => {
                log::warn!("X11 indisponible ({reason}), essai avec evdev");
                evdev::start(shared)
            }
        },
        Session::Wayland => evdev::start(shared),
    }
}

/// Blocage impossible.
struct Unavailable(Reason, String);

impl KeyGuard for Unavailable {
    fn status(&self) -> GuardStatus {
        GuardStatus::Unavailable {
            reason: self.0,
            detail: Some(self.1.clone()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_detection() {
        assert_eq!(
            detect_session(Some("wayland"), false, true),
            Session::Wayland
        );
        assert_eq!(detect_session(Some("X11"), true, true), Session::X11);
        assert_eq!(detect_session(None, true, true), Session::Wayland);
        assert_eq!(detect_session(Some("tty"), false, true), Session::X11);
        assert_eq!(detect_session(None, false, false), Session::Wayland);
    }
}
