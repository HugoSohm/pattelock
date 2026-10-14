mod commands;
mod core;
mod counter;
mod cursor;
mod keyguard;
mod settings;
mod shortcut;
mod state;
mod window;

use std::sync::Arc;
use std::time::Duration;

use tauri::{Manager, RunEvent};

use crate::core::Core;
use crate::cursor::CursorFollow;

/// Délai maximal avant d'afficher la fenêtre si le front ne signale pas qu'il est prêt.
const SHOW_FALLBACK: Duration = Duration::from_secs(3);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(window::MonitorTracker::default())
        .manage(CursorFollow::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let core = Core::start(&handle)?;
            let theme = core.prefs().theme;
            app.manage(core);
            app.state::<CursorFollow>().start(handle.clone());

            window::create_main(&handle, theme)?;
            // Filet de sécurité : la fenêtre s'affiche même si le front ne répond pas.
            std::thread::spawn(move || {
                std::thread::sleep(SHOW_FALLBACK);
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || window::show_main_once(&h));
            });
            Ok(())
        })
        .on_window_event(window::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::cat_clicked,
            commands::toggle_lock_all,
            commands::toggle_key,
            commands::update_settings,
            commands::set_shortcut,
            commands::begin_shortcut_capture,
            commands::end_shortcut_capture,
            commands::open_accessibility_settings,
            commands::report_local_key,
            commands::set_cat_anchor,
            commands::ui_ready,
            commands::hide_window,
        ])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Pattelock");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(core) = app.try_state::<Arc<Core>>() {
                core.flush_counter(true);
            }
        }
    });
}
