mod autostart;
mod commands;
mod core;
mod counter;
mod cursor;
mod hotkey;
mod keyguard;
mod settings;
mod shortcut;
mod state;
mod tray;
mod window;

use std::sync::Arc;
use std::time::Duration;

use tauri::{Manager, RunEvent, WindowEvent};

use crate::core::Core;
use crate::cursor::CursorFollow;

/// Délai maximal avant d'afficher la fenêtre si le front ne signale pas qu'il est prêt.
const SHOW_FALLBACK: Duration = Duration::from_secs(3);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // En premier : relancer l'app ramène la fenêtre existante au premier plan.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(hotkey::plugin())
        .plugin(autostart::plugin())
        .manage(window::MonitorTracker::default())
        .manage(CursorFollow::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let core = Core::start(&handle)?;
            let theme = core.prefs().theme;
            let mode = core.mode();
            app.manage(core);
            app.state::<CursorFollow>().start(handle.clone());

            if autostart::launched_at_login(std::env::args()) {
                // Lancée avec la session : on reste discrètement dans le tray.
                window::keep_hidden();
            }
            window::create_main(&handle, theme)?;
            tray::create(&handle, mode)?;
            // Filet de sécurité : la fenêtre s'affiche même si le front ne répond pas.
            std::thread::spawn(move || {
                std::thread::sleep(SHOW_FALLBACK);
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || window::show_main_once(&h));
            });
            Ok(())
        })
        .on_window_event(|win, event| {
            window::on_window_event(win, event);
            match event {
                // Fermer la fenêtre la cache : Pattelock reste dans le tray et le blocage
                // continue.
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    window::hide_main(win.app_handle());
                }
                // L'icône du tray suit le thème du système.
                WindowEvent::ThemeChanged(_) => {
                    if let Some(core) = win.try_state::<Arc<Core>>() {
                        tray::refresh(win.app_handle(), core.mode());
                    }
                }
                _ => {}
            }
        })
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
