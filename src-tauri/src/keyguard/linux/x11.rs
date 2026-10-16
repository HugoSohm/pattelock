//! X11 : `XGrabKey` sur chaque touche bloquée (avec les combinaisons NumLock / Verr. Maj),
//! ce qui avale la touche sans droits particuliers. En mode clavier entier,
//! `XGrabKeyboard` sur la fenêtre racine, et on reconnaît soi-même le raccourci.
//!
//! La connexion X est fermée avec le processus : toutes les captures disparaissent.
//! Limite : une touche déjà capturée par le bureau (souvent Impr. écran) ne peut pas
//! l'être une seconde fois ; l'UI l'indique.

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt, GrabMode, GrabStatus, KeyButMask, ModMask, Window};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::CURRENT_TIME;

use super::super::combo::Mods;
use super::super::keys::{evdev_codes, from_evdev_key, X11_KEYCODE_OFFSET};
use super::super::{GuardMode, GuardStatus, KeyGuard, Reason, Shared};

/// Combinaisons capturées pour chaque touche : sans modificateur, Verr. Maj, NumLock, les deux.
fn lock_combos() -> [ModMask; 4] {
    [
        ModMask::from(0u16),
        ModMask::LOCK,
        ModMask::M2,
        ModMask::LOCK | ModMask::M2,
    ]
}

fn keycode(evdev: u16) -> u8 {
    (evdev + X11_KEYCODE_OFFSET) as u8
}

fn mods_of(state: KeyButMask) -> Mods {
    let mut m = 0;
    if state.contains(KeyButMask::CONTROL) {
        m |= Mods::CTRL;
    }
    if state.contains(KeyButMask::MOD1) {
        m |= Mods::ALT;
    }
    if state.contains(KeyButMask::SHIFT) {
        m |= Mods::SHIFT;
    }
    if state.contains(KeyButMask::MOD4) {
        m |= Mods::META;
    }
    Mods(m)
}

#[derive(Default)]
struct Grabs {
    keys: Vec<u8>,
    keyboard: bool,
}

struct X11Guard {
    conn: Arc<RustConnection>,
    root: Window,
    shared: Arc<Shared>,
    grabs: Mutex<Grabs>,
    status: Arc<Mutex<GuardStatus>>,
}

impl X11Guard {
    fn set_status(&self, s: GuardStatus) {
        if let Ok(mut cur) = self.status.lock() {
            *cur = s;
        }
    }

    fn grab_key(&self, kc: u8) -> bool {
        let mut ok = true;
        for m in lock_combos() {
            let res = self
                .conn
                .grab_key(false, self.root, m, kc, GrabMode::ASYNC, GrabMode::ASYNC)
                .map(|cookie| cookie.check());
            if !matches!(res, Ok(Ok(()))) {
                ok = false;
            }
        }
        if !ok {
            self.ungrab_key(kc);
        }
        ok
    }

    fn ungrab_key(&self, kc: u8) {
        for m in lock_combos() {
            let _ = self.conn.ungrab_key(kc, self.root, m);
        }
    }

    fn grab_keyboard(&self) -> bool {
        // Une autre application peut tenir le clavier un court instant (menu ouvert...).
        for _ in 0..10 {
            let reply = self
                .conn
                .grab_keyboard(
                    false,
                    self.root,
                    CURRENT_TIME,
                    GrabMode::ASYNC,
                    GrabMode::ASYNC,
                )
                .ok()
                .and_then(|c| c.reply().ok());
            if reply.is_some_and(|r| r.status == GrabStatus::SUCCESS) {
                return true;
            }
            thread::sleep(Duration::from_millis(50));
        }
        false
    }

    /// Met les captures en accord avec le mode et les touches choisies.
    fn apply(&self) {
        let Ok(mut grabs) = self.grabs.lock() else {
            return;
        };
        for kc in grabs.keys.drain(..) {
            self.ungrab_key(kc);
        }
        let mode = self.shared.mode();
        if grabs.keyboard && mode != GuardMode::All {
            let _ = self.conn.ungrab_keyboard(CURRENT_TIME);
            grabs.keyboard = false;
        }
        let mut status = GuardStatus::Ok;
        match mode {
            GuardMode::Off => {}
            GuardMode::FKeys => {
                let mut refused = Vec::new();
                for key in self.shared.blocked_keys() {
                    // Le pavé numérique compte plusieurs touches : tout ou rien.
                    let mut taken = Vec::new();
                    let all = evdev_codes(key).into_iter().all(|code| {
                        let kc = keycode(code);
                        let ok = self.grab_key(kc);
                        if ok {
                            taken.push(kc);
                        }
                        ok
                    });
                    if all {
                        grabs.keys.extend(taken);
                    } else {
                        for kc in taken {
                            self.ungrab_key(kc);
                        }
                        refused.push(key);
                    }
                }
                if !refused.is_empty() {
                    status = GuardStatus::Partial {
                        unavailable: refused,
                    };
                }
            }
            GuardMode::All => {
                if !grabs.keyboard {
                    grabs.keyboard = self.grab_keyboard();
                }
                if !grabs.keyboard {
                    status = GuardStatus::unavailable(Reason::KeyboardBusy);
                }
            }
        }
        let _ = self.conn.flush();
        self.set_status(status);
    }
}

impl KeyGuard for X11Guard {
    fn status(&self) -> GuardStatus {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or(GuardStatus::Starting)
    }

    fn update(&self) {
        self.apply();
    }
}

/// Lit les touches capturées : compteur, et déverrouillage en mode clavier entier.
fn event_loop(conn: Arc<RustConnection>, shared: Arc<Shared>, status: Arc<Mutex<GuardStatus>>) {
    // La répétition automatique X11 envoie relâchement + pression au même instant.
    let mut last_release: Option<(u8, u32)> = None;
    loop {
        let event = match conn.wait_for_event() {
            Ok(e) => e,
            Err(e) => {
                log::error!("connexion X11 perdue : {e}");
                if let Ok(mut s) = status.lock() {
                    *s = GuardStatus::unavailable(Reason::X11Lost);
                }
                return;
            }
        };
        match event {
            Event::KeyPress(e) => {
                let repeat = last_release == Some((e.detail, e.time));
                if repeat {
                    continue;
                }
                let evdev = u16::from(e.detail).saturating_sub(X11_KEYCODE_OFFSET);
                let key = from_evdev_key(evdev);
                if shared.mode() == GuardMode::All {
                    let unlock = shared.unlock();
                    if u32::from(evdev) == unlock.code && mods_of(e.state) == unlock.mods {
                        shared.unlock_pressed();
                        continue;
                    }
                }
                shared.intercepted(key);
            }
            Event::KeyRelease(e) => last_release = Some((e.detail, e.time)),
            _ => {}
        }
    }
}

pub fn start(shared: Arc<Shared>) -> Result<Box<dyn KeyGuard>, String> {
    let (conn, screen) = x11rb::connect(None).map_err(|e| e.to_string())?;
    let root = conn
        .setup()
        .roots
        .get(screen)
        .map(|s| s.root)
        .ok_or("écran X introuvable")?;
    let conn = Arc::new(conn);
    let status = Arc::new(Mutex::new(GuardStatus::Starting));
    let guard = X11Guard {
        conn: conn.clone(),
        root,
        shared: shared.clone(),
        grabs: Mutex::new(Grabs::default()),
        status: status.clone(),
    };
    guard.apply();
    thread::Builder::new()
        .name("pattelock-x11".into())
        .spawn(move || event_loop(conn, shared, status))
        .map_err(|e| e.to_string())?;
    Ok(Box::new(guard))
}
