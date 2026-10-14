mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(window::MonitorTracker::default())
        .setup(|app| {
            let main = app
                .get_webview_window("main")
                .ok_or("fenêtre principale introuvable")?;
            window::fit_and_show(&main.as_ref().window())?;
            Ok(())
        })
        .on_window_event(window::on_window_event)
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Pattelock");
}
