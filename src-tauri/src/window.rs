//! Taille et placement de la fenêtre principale.
//!
//! La fenêtre occupe environ 1/3 de la largeur de la zone utile (écran moins barre des
//! tâches ou dock) du moniteur sur lequel elle s'ouvre, avec le ratio de la maquette
//! (760 x 584). Les calculs se font en tailles logiques, puis sont convertis en pixels
//! physiques avec le facteur d'échelle du moniteur visé.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::window::Color;
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, Theme, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};

use crate::cursor::CursorFollow;
use crate::settings::ThemePref;

pub const MAIN: &str = "main";
const BG_LIGHT: Color = Color(0xfb, 0xfa, 0xf7, 0xff);
const BG_DARK: Color = Color(0x1c, 0x1a, 0x21, 0xff);

/// Ratio largeur / hauteur de la maquette (760 x 584).
pub const RATIO: f64 = 760.0 / 584.0;
/// Largeur logique minimale (hauteur correspondante : 461).
pub const MIN_WIDTH: f64 = 600.0;
/// Largeur logique maximale (hauteur correspondante : 876).
pub const MAX_WIDTH: f64 = 1140.0;
/// La hauteur ne dépasse pas cette part de la hauteur utile.
const MAX_HEIGHT_SHARE: f64 = 0.55;

/// Taille logique de la fenêtre.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LogicalDims {
    pub width: f64,
    pub height: f64,
}

/// Rectangle en pixels physiques.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Calcule la taille logique de la fenêtre pour une zone utile logique donnée.
pub fn compute_window_size(work_width: f64, work_height: f64) -> LogicalDims {
    let mut width = work_width / 3.0;
    let height = width / RATIO;
    let max_height = work_height * MAX_HEIGHT_SHARE;
    if height > max_height {
        width = max_height * RATIO;
    }
    let width = width.clamp(MIN_WIDTH, MAX_WIDTH).round();
    LogicalDims {
        width,
        height: (width / RATIO).round(),
    }
}

/// Place une fenêtre de `size` (physique) centrée sur `center`, sans sortir de `work`
/// (si elle est plus grande que la zone utile, on l'aligne en haut à gauche).
pub fn place(work: Rect, size: (u32, u32), center: (f64, f64)) -> (i32, i32) {
    let axis = |start: i32, extent: u32, len: u32, c: f64| -> i32 {
        let wanted = (c - f64::from(len) / 2.0).round() as i64;
        let max = i64::from(start) + i64::from(extent) - i64::from(len);
        wanted.min(max).max(i64::from(start)) as i32
    };
    (
        axis(work.x, work.width, size.0, center.0),
        axis(work.y, work.height, size.1, center.1),
    )
}

fn work_rect(monitor: &Monitor) -> Rect {
    let area = monitor.work_area();
    Rect {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
    }
}

fn rect_center(r: Rect) -> (f64, f64) {
    (
        f64::from(r.x) + f64::from(r.width) / 2.0,
        f64::from(r.y) + f64::from(r.height) / 2.0,
    )
}

fn target_monitor<R: Runtime>(window: &Window<R>) -> tauri::Result<Option<Monitor>> {
    Ok(match window.current_monitor()? {
        Some(m) => Some(m),
        None => window.primary_monitor()?,
    })
}

/// Identifie un moniteur pour savoir si la fenêtre a changé d'écran.
#[derive(Debug, Clone, PartialEq)]
struct MonitorKey {
    work: Rect,
    scale: f64,
}

/// Dernier moniteur pour lequel la fenêtre a été dimensionnée.
#[derive(Default)]
pub struct MonitorTracker(Mutex<Option<MonitorKey>>);

/// Dimensionne la fenêtre pour son moniteur. Si `recenter` vaut `true`, elle est centrée
/// dans la zone utile, sinon on garde son centre actuel (en restant dans la zone utile).
fn fit<R: Runtime>(window: &Window<R>, recenter: bool) -> tauri::Result<()> {
    let Some(monitor) = target_monitor(window)? else {
        log::warn!("aucun moniteur détecté, taille par défaut conservée");
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let work = work_rect(&monitor);
    let dims = compute_window_size(
        f64::from(work.width) / scale,
        f64::from(work.height) / scale,
    );
    let size = (
        (dims.width * scale).round() as u32,
        (dims.height * scale).round() as u32,
    );

    let center = if recenter {
        rect_center(work)
    } else {
        let pos = window.outer_position()?;
        let cur = window.outer_size()?;
        rect_center(Rect {
            x: pos.x,
            y: pos.y,
            width: cur.width,
            height: cur.height,
        })
    };
    let (x, y) = place(work, size, center);

    // Position d'abord pour que l'OS applique le bon DPI, puis taille, puis position
    // finale (un changement de DPI peut avoir retouché la taille entre-temps).
    window.set_position(PhysicalPosition::new(x, y))?;
    window.set_size(PhysicalSize::new(size.0, size.1))?;
    window.set_position(PhysicalPosition::new(x, y))?;

    if let Some(tracker) = window.try_state::<MonitorTracker>() {
        if let Ok(mut last) = tracker.0.lock() {
            *last = Some(MonitorKey { work, scale });
        }
    }
    log::info!(
        "fenêtre {}x{} logiques ({}x{} physiques) à {x},{y}, échelle {scale}",
        dims.width,
        dims.height,
        size.0,
        size.1
    );
    Ok(())
}

fn window_theme(pref: ThemePref) -> Option<Theme> {
    match pref {
        ThemePref::System => None,
        ThemePref::Light => Some(Theme::Light),
        ThemePref::Dark => Some(Theme::Dark),
    }
}

fn background(theme: Theme) -> Color {
    if theme == Theme::Dark {
        BG_DARK
    } else {
        BG_LIGHT
    }
}

/// Crée la fenêtre principale, invisible, avec le thème déjà appliqué (pas de flash
/// clair au lancement en mode sombre), puis la dimensionne et la centre.
pub fn create_main(app: &AppHandle, theme: ThemePref) -> tauri::Result<WebviewWindow> {
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Pattelock")
        .inner_size(760.0, 584.0)
        .visible(false)
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .shadow(true)
        .theme(window_theme(theme));
    // En mode « Système », on ne connaît le thème de l'OS qu'une fois la fenêtre créée.
    if theme != ThemePref::System {
        builder = builder.background_color(background(window_theme(theme).unwrap_or(Theme::Light)));
    }
    let window = builder.build()?;
    #[cfg(windows)]
    disable_browser_accelerators(&window);
    if theme == ThemePref::System {
        let resolved = window.theme().unwrap_or(Theme::Light);
        let _ = window.set_background_color(Some(background(resolved)));
    }
    if let Err(e) = fit(&window.as_ref().window(), true) {
        log::error!("calcul de la taille de fenêtre impossible : {e}");
    }
    Ok(window)
}

/// Coupe les raccourcis du navigateur de WebView2 (F5 recharge, F7 navigation au curseur,
/// Ctrl+P imprime...) : ils sont traités avant la page, qui ne pourrait pas les annuler
/// quand la fenêtre de Pattelock elle-même a le focus. La page reçoit toujours les touches.
#[cfg(windows)]
fn disable_browser_accelerators(window: &WebviewWindow) {
    let result = window.with_webview(|webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows::core::Interface;
        // SAFETY : appels COM sur le contrôleur WebView2, depuis le thread principal.
        let result = unsafe {
            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
                .and_then(|settings| settings.cast::<ICoreWebView2Settings3>())
                .and_then(|settings| settings.SetAreBrowserAcceleratorKeysEnabled(false))
        };
        if let Err(e) = result {
            log::warn!("raccourcis du navigateur toujours actifs : {e}");
        }
    });
    if let Err(e) = result {
        log::warn!("accès à la webview impossible : {e}");
    }
}

/// Applique le thème choisi à la fenêtre (le front suit via `prefers-color-scheme`).
pub fn apply_theme(app: &AppHandle, pref: ThemePref) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let _ = window.set_theme(window_theme(pref));
    let resolved = window.theme().unwrap_or(Theme::Light);
    let _ = window.set_background_color(Some(background(resolved)));
}

/// La fenêtre a-t-elle déjà été affichée une fois ?
static SHOWN: AtomicBool = AtomicBool::new(false);

/// Affiche la fenêtre principale au premier plan.
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    SHOWN.store(true, Ordering::Release);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    report_visibility(&window.as_ref().window());
}

/// Affiche la fenêtre au premier lancement, sauf si on a déjà fait autrement.
pub fn show_main_once(app: &AppHandle) {
    if !SHOWN.load(Ordering::Acquire) {
        show_main(app);
    }
}

/// Note que la fenêtre ne doit pas s'afficher toute seule (lancement au démarrage).
pub fn keep_hidden() {
    SHOWN.store(true, Ordering::Release);
}

pub fn hide_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.hide();
        report_visibility(&window.as_ref().window());
    }
}

/// Prévient le reste de l'app quand la fenêtre est cachée, réduite ou réaffichée.
pub fn report_visibility<R: Runtime>(window: &Window<R>) {
    let visible = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    let app = window.app_handle();
    if let Some(follow) = app.try_state::<CursorFollow>() {
        follow.set_visible(app, visible);
    }
}

/// Recalcule la taille quand la fenêtre change d'écran ou de DPI.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if matches!(event, WindowEvent::Resized(_) | WindowEvent::Focused(_)) {
        report_visibility(window);
    }
    let changed = match event {
        WindowEvent::ScaleFactorChanged { .. } => true,
        WindowEvent::Moved(_) => monitor_changed(window),
        _ => false,
    };
    if changed {
        if let Err(e) = fit(window, false) {
            log::warn!("redimensionnement après changement d'écran impossible : {e}");
        }
    }
}

fn monitor_changed<R: Runtime>(window: &Window<R>) -> bool {
    let Ok(Some(monitor)) = target_monitor(window) else {
        return false;
    };
    let key = MonitorKey {
        work: work_rect(&monitor),
        scale: monitor.scale_factor(),
    };
    let Some(tracker) = window.try_state::<MonitorTracker>() else {
        return false;
    };
    let last = tracker.0.lock().map(|l| l.clone()).unwrap_or(None);
    last.is_some_and(|last| last != key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dims(w: f64, h: f64) -> (f64, f64) {
        let d = compute_window_size(w, h);
        (d.width, d.height)
    }

    #[test]
    fn ratio_matches_mockup() {
        assert!((RATIO - 1.301).abs() < 0.001);
    }

    #[test]
    fn laptop_1366x768_hits_minimum() {
        // Zone utile : 1366 x 728 (barre des tâches de 40 px).
        assert_eq!(dims(1366.0, 728.0), (600.0, 461.0));
    }

    #[test]
    fn full_hd_is_one_third() {
        assert_eq!(dims(1920.0, 1040.0), (640.0, 492.0));
    }

    #[test]
    fn qhd_2560x1440() {
        assert_eq!(dims(2560.0, 1400.0), (853.0, 655.0));
    }

    #[test]
    fn uhd_at_200_percent_behaves_like_full_hd() {
        // 3840 x 2160 à 200 % : zone utile logique 1920 x 1040.
        let scale = 2.0;
        assert_eq!(dims(3840.0 / scale, 2080.0 / scale), (640.0, 492.0));
    }

    #[test]
    fn macbook_1512x982_hits_minimum() {
        // Barre de menus (~37 px) et dock retirés.
        assert_eq!(dims(1512.0, 945.0), (600.0, 461.0));
    }

    #[test]
    fn ultrawide_is_limited_by_height() {
        // 3440 x 1440 : 1/3 de la largeur donnerait 881 px de haut > 55 % de 1400.
        let (w, h) = dims(3440.0, 1400.0);
        assert_eq!((w, h), (1002.0, 770.0));
        assert!(h <= 1400.0 * 0.55 + 0.5);
    }

    #[test]
    fn uhd_at_100_percent_hits_maximum() {
        assert_eq!(dims(3840.0, 2120.0), (1140.0, 876.0));
    }

    #[test]
    fn place_centers_in_work_area() {
        let work = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };
        assert_eq!(place(work, (640, 492), rect_center(work)), (640, 274));
    }

    #[test]
    fn place_respects_offset_work_area() {
        // Second écran à droite, barre des tâches en haut.
        let work = Rect {
            x: 1920,
            y: 40,
            width: 2560,
            height: 1400,
        };
        // Centre à (3200, 740) : 3200 - 426,5 et 740 - 327,5, arrondis.
        assert_eq!(place(work, (853, 655), rect_center(work)), (2774, 413));
    }

    #[test]
    fn place_clamps_inside_work_area() {
        let work = Rect {
            x: 0,
            y: 0,
            width: 1366,
            height: 728,
        };
        assert_eq!(place(work, (600, 461), (10.0, 10.0)), (0, 0));
        assert_eq!(place(work, (600, 461), (1360.0, 720.0)), (766, 267));
    }

    #[test]
    fn place_aligns_top_left_when_too_big() {
        let work = Rect {
            x: 100,
            y: 50,
            width: 500,
            height: 400,
        };
        assert_eq!(place(work, (600, 461), rect_center(work)), (100, 50));
    }
}
