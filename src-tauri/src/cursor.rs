//! Suivi du curseur global pour les yeux du chat, et visibilité de la fenêtre.
//!
//! Le curseur n'est lu (à 25 Hz) que si la fenêtre est visible et le chat éveillé.
//! Sinon le thread dort complètement. Si la position globale est indisponible
//! (Wayland notamment), on arrête : le front se contente du curseur dans la fenêtre.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread::{self, Thread};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const EV_CURSOR: &str = "global-cursor";
pub const EV_VISIBILITY: &str = "window-visibility";

const POLL: Duration = Duration::from_millis(40);

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
struct Offset {
    x: f64,
    y: f64,
}

#[derive(Default)]
pub struct CursorFollow {
    /// Centre des yeux du chat dans la fenêtre, en px CSS.
    anchor: Mutex<(f64, f64)>,
    tracking: AtomicBool,
    visible: AtomicBool,
    unsupported: AtomicBool,
    thread: OnceLock<Thread>,
}

impl CursorFollow {
    pub fn start(&self, app: AppHandle) {
        let spawned = thread::Builder::new()
            .name("pattelock-cursor".into())
            .spawn(move || poll_loop(app));
        match spawned {
            Ok(h) => {
                let _ = self.thread.set(h.thread().clone());
            }
            Err(e) => log::warn!("suivi du curseur indisponible : {e}"),
        }
    }

    fn wake(&self) {
        if let Some(t) = self.thread.get() {
            t.unpark();
        }
    }

    fn active(&self) -> bool {
        self.tracking.load(Ordering::Acquire)
            && self.visible.load(Ordering::Acquire)
            && !self.unsupported.load(Ordering::Acquire)
    }

    pub fn set_anchor(&self, x: f64, y: f64, tracking: bool) {
        if let Ok(mut a) = self.anchor.lock() {
            *a = (x, y);
        }
        self.tracking.store(tracking, Ordering::Release);
        self.wake();
    }

    /// Met à jour la visibilité de la fenêtre et prévient le front si elle change.
    pub fn set_visible<R: Runtime>(&self, app: &AppHandle<R>, visible: bool) {
        if self.visible.swap(visible, Ordering::AcqRel) != visible {
            let _ = app.emit(EV_VISIBILITY, visible);
        }
        self.wake();
    }
}

fn poll_loop(app: AppHandle) {
    let mut last: Option<Offset> = None;
    loop {
        let follow = app.state::<CursorFollow>();
        if !follow.active() {
            last = None;
            thread::park();
            continue;
        }
        let Some(window) = app.get_webview_window("main") else {
            thread::park();
            continue;
        };
        let cursor = match app.cursor_position() {
            Ok(c) => c,
            Err(e) => {
                log::info!("position globale du curseur indisponible ({e}), suivi dans la fenêtre seulement");
                follow.unsupported.store(true, Ordering::Release);
                continue;
            }
        };
        let (Ok(pos), Ok(scale)) = (window.inner_position(), window.scale_factor()) else {
            thread::sleep(POLL);
            continue;
        };
        let (ax, ay) = follow.anchor.lock().map(|a| *a).unwrap_or((0.0, 0.0));
        let offset = Offset {
            x: ((cursor.x - f64::from(pos.x)) / scale - ax).round(),
            y: ((cursor.y - f64::from(pos.y)) / scale - ay).round(),
        };
        if last != Some(offset) {
            let _ = app.emit(EV_CURSOR, offset);
            last = Some(offset);
        }
        thread::sleep(POLL);
    }
}
