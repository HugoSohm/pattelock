//! Lancement au démarrage de la session (`tauri-plugin-autostart`).
//!
//! Lancée ainsi, l'app reçoit `--autostart` et reste cachée dans le tray. Le réglage
//! affiché reflète l'état réel du système (l'utilisateur a pu le changer ailleurs).

use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

pub const ARG: &str = "--autostart";

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![ARG]))
}

/// L'app a-t-elle été lancée par la session (et doit-elle rester cachée) ?
pub fn launched_at_login<I: IntoIterator<Item = String>>(args: I) -> bool {
    args.into_iter().any(|a| a == ARG)
}

pub fn is_enabled<R: Runtime>(app: &AppHandle<R>) -> Option<bool> {
    match app.autolaunch().is_enabled() {
        Ok(v) => Some(v),
        Err(e) => {
            log::warn!("état du lancement au démarrage illisible : {e}");
            None
        }
    }
}

pub fn set<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let res = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    res.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_login_launch() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(launched_at_login(args(&["pattelock", "--autostart"])));
        assert!(!launched_at_login(args(&["pattelock"])));
        assert!(!launched_at_login(args(&["pattelock", "--autostart=0"])));
    }
}
