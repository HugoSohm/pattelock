//! Raccourci global on/off via `tauri-plugin-global-shortcut`.
//!
//! En mode clavier entier, c'est le hook qui reconnaît le raccourci (il avale tout, le
//! plugin ne recevrait rien). Sous Wayland, le plugin ne fonctionne pas : le hook evdev
//! reconnaît le raccourci dans tous les modes et le plugin n'est pas utilisé.

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::shortcut::{Shortcut, ShortcutError};

/// Plugin à installer dans le builder Tauri : chaque appui bascule la protection.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(core) = app.try_state::<std::sync::Arc<crate::core::Core>>() {
                    log::info!("raccourci global pressé");
                    core.act(crate::state::Action::Shortcut);
                }
            }
        })
        .build()
}

/// Enregistre le raccourci. `Err(Taken)` si le système ou une autre app l'utilise déjà.
pub fn register<R: Runtime>(app: &AppHandle<R>, s: &Shortcut) -> Result<(), ShortcutError> {
    let gs = app.global_shortcut();
    let accel = s.accelerator();
    if gs.is_registered(accel.as_str()) {
        return Ok(());
    }
    gs.register(accel.as_str()).map_err(|e| {
        log::warn!("raccourci {accel} refusé : {e}");
        ShortcutError::Taken
    })
}

pub fn unregister<R: Runtime>(app: &AppHandle<R>, s: &Shortcut) {
    let accel = s.accelerator();
    if let Err(e) = app.global_shortcut().unregister(accel.as_str()) {
        log::debug!("raccourci {accel} déjà libéré : {e}");
    }
}
