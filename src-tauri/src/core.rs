//! Cœur de l'app : l'état fait foi ici, le front ne fait que l'afficher.
//!
//! Chaque changement passe par `Core`, qui met à jour le hook (`keyguard::Shared`),
//! persiste les réglages, prévient le front (`state-changed`) et rafraîchit le tray.

use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Wry};
use tauri_plugin_store::{Store, StoreBuilder};

use crate::counter::{Counter, Throttle};
use crate::keyguard::keys::{mask_of, BlockableKey};
use crate::keyguard::{self, GuardEvent, GuardMode, GuardStatus, KeyGuard, Shared};
use crate::settings::{
    total_from_json, Prefs, SettingsPatch, ThemePref, PREFS_KEY, STORE_FILE, TOTAL_KEY,
};
use crate::shortcut::{Shortcut, ShortcutError};
use crate::state::{next_mode, persisted_active, startup_mode, Action, Mode};

pub const EV_STATE: &str = "state-changed";
pub const EV_TOTAL: &str = "total-changed";
pub const EV_INTERCEPTED: &str = "key-intercepted";

/// Ce que reçoit le front (voir `src/types.ts`).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub mode: Mode,
    pub blocked: Vec<BlockableKey>,
    pub shortcut: Shortcut,
    pub settings: SettingsView,
    pub total: u64,
    pub platform: &'static str,
    pub guard: GuardStatus,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub skin: String,
    pub accent: String,
    pub theme: ThemePref,
    pub autostart: bool,
    pub media_keys: bool,
}

#[derive(Serialize, Clone)]
struct Intercepted {
    key: &'static str,
    timestamp: u64,
}

pub const PLATFORM: &str = if cfg!(target_os = "macos") {
    "macos"
} else if cfg!(windows) {
    "windows"
} else {
    "linux"
};

struct Inner {
    mode: Mode,
    prefs: Prefs,
}

pub struct Core {
    app: AppHandle,
    store: Arc<Store<Wry>>,
    inner: Mutex<Inner>,
    shared: Arc<Shared>,
    guard: Box<dyn KeyGuard>,
    pub counter: Counter,
}

impl Core {
    /// Lit le store, démarre le hook et le thread des événements.
    pub fn start(app: &AppHandle) -> Result<Arc<Core>, Box<dyn std::error::Error>> {
        let store = StoreBuilder::new(app, STORE_FILE)
            .disable_auto_save()
            .build()?;
        let prefs = Prefs::from_json(store.get(PREFS_KEY).as_ref());
        let total = total_from_json(store.get(TOTAL_KEY).as_ref());
        // Le mode clavier entier n'est jamais restauré.
        let mode = startup_mode(prefs.active);

        let (shared, rx) = Shared::new();
        let shared = Arc::new(shared);
        shared.set(
            GuardMode::from(mode),
            mask_of(&prefs.blocked),
            &prefs.shortcut,
            prefs.media_keys,
        );
        let guard = keyguard::start(shared.clone());
        log::info!("blocage : {:?}", guard.status());

        let core = Arc::new(Core {
            app: app.clone(),
            store,
            inner: Mutex::new(Inner { mode, prefs }),
            shared,
            guard,
            counter: Counter::new(total),
        });
        spawn_event_pump(app.clone(), core.clone(), rx);
        Ok(core)
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // Un panic ailleurs ne doit pas bloquer l'app : on reprend l'état tel quel.
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn snapshot(&self) -> AppState {
        let inner = self.lock();
        let p = &inner.prefs;
        AppState {
            mode: inner.mode,
            blocked: p.blocked.clone(),
            shortcut: p.shortcut.clone(),
            settings: SettingsView {
                skin: p.skin.clone(),
                accent: p.accent.clone(),
                theme: p.theme,
                autostart: p.autostart,
                media_keys: p.media_keys,
            },
            total: self.counter.total(),
            platform: PLATFORM,
            guard: self.guard.status(),
        }
    }

    pub fn mode(&self) -> Mode {
        self.lock().mode
    }

    pub fn prefs(&self) -> Prefs {
        self.lock().prefs.clone()
    }

    pub fn act(&self, action: Action) {
        let mode = next_mode(self.mode(), action);
        self.set_mode(mode);
    }

    pub fn set_mode(&self, mode: Mode) {
        {
            let mut inner = self.lock();
            if inner.mode == mode {
                return;
            }
            log::info!("mode {:?} -> {:?}", inner.mode, mode);
            inner.mode = mode;
            inner.prefs.active = persisted_active(mode);
        }
        self.commit();
    }

    /// Bascule une touche de la bande (sans effet en mode clavier entier).
    pub fn toggle_key(&self, key: BlockableKey) {
        {
            let mut inner = self.lock();
            if inner.mode == Mode::All {
                return;
            }
            let blocked = &mut inner.prefs.blocked;
            if let Some(i) = blocked.iter().position(|k| *k == key) {
                blocked.remove(i);
            } else {
                blocked.push(key);
                blocked.sort();
            }
        }
        self.commit();
    }

    pub fn update_settings(&self, patch: SettingsPatch) {
        let theme_changed = patch.theme.is_some();
        {
            let mut inner = self.lock();
            patch.apply_to(&mut inner.prefs);
        }
        if theme_changed {
            crate::window::apply_theme(&self.app, self.prefs().theme);
        }
        self.commit();
    }

    pub fn set_shortcut(&self, shortcut: Shortcut) -> Result<(), ShortcutError> {
        shortcut.validate()?;
        self.lock().prefs.shortcut = shortcut;
        self.commit();
        Ok(())
    }

    /// Propage l'état : hook, disque, front, tray.
    fn commit(&self) {
        let (mode, prefs) = {
            let inner = self.lock();
            (inner.mode, inner.prefs.clone())
        };
        self.shared.set(
            GuardMode::from(mode),
            mask_of(&prefs.blocked),
            &prefs.shortcut,
            prefs.media_keys,
        );
        self.guard.update();

        match serde_json::to_value(&prefs) {
            Ok(v) => {
                self.store.set(PREFS_KEY, v);
                if let Err(e) = self.store.save() {
                    log::error!("écriture des réglages impossible : {e}");
                }
            }
            Err(e) => log::error!("sérialisation des réglages impossible : {e}"),
        }
        self.emit_state();
    }

    pub fn emit_state(&self) {
        if let Err(e) = self.app.emit(EV_STATE, self.snapshot()) {
            log::warn!("événement {EV_STATE} non envoyé : {e}");
        }
    }

    /// Touche avalée dans la fenêtre de l'app (voir `localGuard.ts`) : même traitement
    /// qu'une interception du hook, si le blocage est bien actif.
    pub fn local_intercept(&self, key: &str) {
        if self.mode() != Mode::Off {
            self.shared.intercepted(BlockableKey::from_id(key));
        }
    }

    /// Relance la détection des permissions (macOS, Linux).
    pub fn retry_guard(&self) {
        self.guard.retry();
        self.emit_state();
    }

    /// Écrit le compteur s'il le faut (`force` : à la fermeture).
    pub fn flush_counter(&self, force: bool) {
        let result = self.counter.flush(Instant::now(), force, |total| {
            self.store.set(TOTAL_KEY, json!(total));
            self.store.save()
        });
        if let Err(e) = result {
            log::error!("écriture du compteur impossible : {e}");
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Thread qui reçoit les événements du hook : compteur, événements vers le front
/// (≈ 10 par seconde au plus) et déverrouillage en mode clavier entier.
fn spawn_event_pump(app: AppHandle, core: Arc<Core>, rx: Receiver<GuardEvent>) {
    let spawned = thread::Builder::new()
        .name("pattelock-events".into())
        .spawn(move || {
            let mut throttle = Throttle::new(Duration::from_millis(100));
            let mut emitted_total = core.counter.total();
            loop {
                match rx.recv_timeout(Duration::from_millis(250)) {
                    Ok(GuardEvent::Intercepted { key }) => {
                        let now = Instant::now();
                        let total = core.counter.increment(now);
                        if throttle.allow(now) {
                            let payload = Intercepted {
                                key,
                                timestamp: now_ms(),
                            };
                            let _ = app.emit(EV_INTERCEPTED, payload);
                            let _ = app.emit(EV_TOTAL, total);
                            emitted_total = total;
                        }
                    }
                    Ok(GuardEvent::Unlock) => {
                        log::info!("déverrouillage par le raccourci, détecté dans le hook");
                        core.act(Action::Shortcut);
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
                // Dernière valeur du compteur, si elle a été retenue par la limite.
                let total = core.counter.total();
                if total != emitted_total && throttle.allow(Instant::now()) {
                    let _ = app.emit(EV_TOTAL, total);
                    emitted_total = total;
                }
                core.flush_counter(false);
            }
        });
    if let Err(e) = spawned {
        log::error!("thread des événements non démarré : {e}");
    }
}
