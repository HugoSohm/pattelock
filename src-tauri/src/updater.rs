//! Mises à jour (`tauri-plugin-updater`) : vérification 10 s après le lancement puis toutes
//! les 24 h, seulement si l'option des Réglages est active. C'est le seul accès réseau de
//! l'app. La mise à jour n'est installée que sur demande de l'utilisateur.

use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::core::Core;

const FIRST_CHECK: Duration = Duration::from_secs(10);
const INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateStatus {
    Available,
    Downloading,
    Installing,
    Failed,
}

/// Ce que l'UI affiche (voir `src/types.ts`).
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub status: UpdateStatus,
    /// Progression du téléchargement, en %.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<u8>,
}

#[derive(Default)]
pub struct Updates {
    info: Mutex<Option<UpdateInfo>>,
    pending: Mutex<Option<Update>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Updates {
    pub fn info(&self) -> Option<UpdateInfo> {
        lock(&self.info).clone()
    }
}

/// Modifie l'info affichée et prévient l'UI si elle a changé.
fn set_info(app: &AppHandle, f: impl FnOnce(&mut Option<UpdateInfo>)) {
    let changed = {
        let updates = app.state::<Updates>();
        let mut info = lock(&updates.info);
        let before = info.clone();
        f(&mut info);
        *info != before
    };
    if changed {
        if let Some(core) = app.try_state::<Arc<Core>>() {
            core.emit_state();
        }
    }
}

fn enabled(app: &AppHandle) -> bool {
    app.try_state::<Arc<Core>>()
        .is_some_and(|core| core.prefs().check_updates)
}

async fn check(app: &AppHandle) {
    if !enabled(app) {
        return;
    }
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::warn!("updater indisponible : {e}");
            return;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            log::info!("mise à jour disponible : {}", update.version);
            let version = update.version.clone();
            *lock(&app.state::<Updates>().pending) = Some(update);
            set_info(app, |info| {
                *info = Some(UpdateInfo {
                    version,
                    status: UpdateStatus::Available,
                    progress: None,
                });
            });
        }
        Ok(None) => log::info!("Pattelock est à jour"),
        // Hors ligne, GitHub indisponible... : on réessaiera au prochain passage.
        Err(e) => log::warn!("vérification des mises à jour impossible : {e}"),
    }
}

/// Vérifie au lancement puis toutes les 24 h.
pub fn start(app: AppHandle) {
    let spawned = thread::Builder::new()
        .name("pattelock-updates".into())
        .spawn(move || {
            thread::sleep(FIRST_CHECK);
            loop {
                tauri::async_runtime::block_on(check(&app));
                thread::sleep(INTERVAL);
            }
        });
    if let Err(e) = spawned {
        log::warn!("vérification des mises à jour non démarrée : {e}");
    }
}

/// Vérifie tout de suite (l'option vient d'être activée).
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    let _ = thread::Builder::new()
        .name("pattelock-update-check".into())
        .spawn(move || tauri::async_runtime::block_on(check(&app)));
}

/// L'option vient d'être désactivée : on oublie la mise à jour proposée.
pub fn forget(app: &AppHandle) {
    *lock(&app.state::<Updates>().pending) = None;
    set_info(app, |info| *info = None);
}

/// Pourcentage téléchargé (0 à 100).
pub fn percent(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|t| *t > 0)?;
    Some((downloaded.min(total) * 100 / total) as u8)
}

/// Télécharge et installe la mise à jour, puis relance l'app. Sous Windows, l'installeur
/// prend la main et ferme l'app lui-même.
pub async fn install(app: AppHandle) -> Result<(), String> {
    let Some(update) = lock(&app.state::<Updates>().pending).take() else {
        return Err("noUpdate".into());
    };
    if let Some(core) = app.try_state::<Arc<Core>>() {
        core.flush_counter(true);
    }
    set_info(&app, |info| {
        if let Some(i) = info {
            i.status = UpdateStatus::Downloading;
            i.progress = Some(0);
        }
    });

    let mut downloaded = 0u64;
    let progress_app = app.clone();
    let finished_app = app.clone();
    let result = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let p = percent(downloaded, total);
                set_info(&progress_app, |info| {
                    if let Some(i) = info {
                        i.progress = p;
                    }
                });
            },
            || {
                set_info(&finished_app, |info| {
                    if let Some(i) = info {
                        i.status = UpdateStatus::Installing;
                        i.progress = None;
                    }
                });
            },
        )
        .await;

    match result {
        Ok(()) => {
            log::info!("mise à jour installée, redémarrage");
            app.restart();
        }
        Err(e) => {
            log::error!("mise à jour impossible : {e}");
            // On garde la mise à jour pour pouvoir réessayer.
            *lock(&app.state::<Updates>().pending) = Some(update);
            set_info(&app, |info| {
                if let Some(i) = info {
                    i.status = UpdateStatus::Failed;
                    i.progress = None;
                }
            });
            Err(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_percent() {
        assert_eq!(percent(0, Some(200)), Some(0));
        assert_eq!(percent(50, Some(200)), Some(25));
        assert_eq!(percent(250, Some(200)), Some(100));
        assert_eq!(percent(10, None), None);
        assert_eq!(percent(10, Some(0)), None);
    }

    #[test]
    fn info_json_matches_front() {
        let info = UpdateInfo {
            version: "0.2.0".into(),
            status: UpdateStatus::Downloading,
            progress: Some(42),
        };
        assert_eq!(
            serde_json::to_value(info).unwrap(),
            serde_json::json!({"version": "0.2.0", "status": "downloading", "progress": 42})
        );
    }
}
