//! Commandes appelées par le front (`invoke`). Toute la logique est dans `Core`.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::core::{AppState, Core};
use crate::cursor::CursorFollow;
use crate::keyguard::keys::BlockableKey;
use crate::settings::SettingsPatch;
use crate::shortcut::Shortcut;
use crate::state::Action;

type CoreState<'a> = State<'a, Arc<Core>>;

#[tauri::command]
pub fn get_state(core: CoreState<'_>) -> AppState {
    core.snapshot()
}

#[tauri::command]
pub fn cat_clicked(core: CoreState<'_>) {
    core.act(Action::Cat);
}

#[tauri::command]
pub fn toggle_lock_all(core: CoreState<'_>) {
    core.act(Action::LockAll);
}

#[tauri::command]
pub fn toggle_key(core: CoreState<'_>, key: BlockableKey) {
    core.toggle_key(key);
}

#[tauri::command]
pub fn update_settings(core: CoreState<'_>, patch: SettingsPatch) {
    core.update_settings(patch);
}

/// Rejette avec un message lisible si la combinaison est refusée.
#[tauri::command]
pub fn set_shortcut(core: CoreState<'_>, shortcut: Shortcut) -> Result<(), String> {
    core.set_shortcut(shortcut).map_err(|e| e.message())
}

#[tauri::command]
pub fn begin_shortcut_capture(core: CoreState<'_>) {
    core.begin_shortcut_capture();
}

#[tauri::command]
pub fn end_shortcut_capture(core: CoreState<'_>) {
    core.end_shortcut_capture();
}

#[tauri::command]
pub fn open_accessibility_settings(core: CoreState<'_>) {
    core.retry_guard();
}

/// Touche avalée par la page quand la fenêtre de l'app a le focus.
#[tauri::command]
pub fn report_local_key(core: CoreState<'_>, key: String) {
    core.local_intercept(&key);
}

#[tauri::command]
pub fn set_cat_anchor(follow: State<'_, CursorFollow>, x: f64, y: f64, tracking: bool) {
    follow.set_anchor(x, y, tracking);
}

/// Premier rendu terminé : on peut afficher la fenêtre sans flash.
#[tauri::command]
pub fn ui_ready(app: AppHandle) {
    crate::window::show_main_once(&app);
}

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    crate::window::hide_main(&app);
}
