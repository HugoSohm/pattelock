//! macOS : event tap (`CGEventTapCreate`) au niveau de la session, option *Default*
//! (pas *ListenOnly*) : le callback renvoie NULL pour avaler l'événement.
//!
//! Il faut la permission Accessibilité. Sans elle, l'UI affiche un écran explicatif et
//! on vérifie la permission chaque seconde pour démarrer le tap dès qu'elle est donnée.
//! Si le système désactive le tap (délai dépassé), on le réactive aussitôt.
//!
//! La rangée du haut des claviers Mac envoie souvent des fonctions média (luminosité,
//! son) : ce sont des événements système (type 14), bloqués aussi si l'option est active.
//!
//! Limites : en saisie sécurisée (champs mot de passe), le tap ne voit pas les touches ;
//! certaines touches (Globe / fn, Ne pas déranger) sont gérées plus bas que le tap.

use std::cell::Cell;
use std::ffi::c_void;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::process::Command;
use std::ptr::{null_mut, NonNull};
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use objc2_app_kit::NSEvent;
use objc2_application_services::AXIsProcessTrusted;
use objc2_core_foundation::{kCFRunLoopCommonModes, CFMachPort, CFRunLoop};
use objc2_core_graphics::{
    CGEvent, CGEventField, CGEventFlags, CGEventMask, CGEventTapLocation, CGEventTapOptions,
    CGEventTapPlacement, CGEventTapProxy, CGEventType,
};

use super::combo::Mods;
use super::keys::{from_macos_keycode, macos_function_row_keycode, macos_media_key};
use super::{GuardMode, GuardStatus, KeyGuard, Shared};

const SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

/// `NSEventTypeSystemDefined` et le sous-type des touches média.
const SYSTEM_DEFINED: u32 = 14;
const AUX_CONTROL_BUTTONS: i64 = 8;

static SHARED: OnceLock<Arc<Shared>> = OnceLock::new();
/// Port du tap, pour le réactiver si le système le coupe.
static TAP: AtomicPtr<CFMachPort> = AtomicPtr::new(null_mut());

thread_local! {
    /// Modificateurs vus au dernier `FlagsChanged` (thread du tap uniquement).
    static PREV_FLAGS: Cell<u64> = const { Cell::new(0) };
}

const MOD_FLAGS: u64 = CGEventFlags::MaskShift.0
    | CGEventFlags::MaskControl.0
    | CGEventFlags::MaskAlternate.0
    | CGEventFlags::MaskCommand.0
    | CGEventFlags::MaskAlphaShift.0;

fn mods_of(flags: CGEventFlags) -> Mods {
    let f = flags.0;
    let mut m = 0;
    if f & CGEventFlags::MaskControl.0 != 0 {
        m |= Mods::CTRL;
    }
    if f & CGEventFlags::MaskAlternate.0 != 0 {
        m |= Mods::ALT;
    }
    if f & CGEventFlags::MaskShift.0 != 0 {
        m |= Mods::SHIFT;
    }
    if f & CGEventFlags::MaskCommand.0 != 0 {
        m |= Mods::META;
    }
    Mods(m)
}

fn key_event(shared: &Shared, ev: &CGEvent, down: bool) -> bool {
    let code = CGEvent::integer_value_field(Some(ev), CGEventField::KeyboardEventKeycode) as u16;
    let repeat = CGEvent::integer_value_field(Some(ev), CGEventField::KeyboardEventAutorepeat) != 0;
    let first_press = down && !repeat;
    match shared.mode() {
        GuardMode::Off => false,
        GuardMode::FKeys => {
            let key = from_macos_keycode(code).or_else(|| {
                if shared.media_keys() {
                    macos_function_row_keycode(code)
                } else {
                    None
                }
            });
            let Some(key) = key else {
                return false;
            };
            if !shared.is_blocked(key) {
                return false;
            }
            if first_press {
                shared.intercepted(Some(key));
            }
            true
        }
        GuardMode::All => {
            let unlock = shared.unlock();
            if first_press
                && u32::from(code) == unlock.code
                && mods_of(CGEvent::flags(Some(ev))) == unlock.mods
            {
                shared.unlock_pressed();
            } else if first_press {
                shared.intercepted(from_macos_keycode(code));
            }
            true
        }
    }
}

fn flags_changed(shared: &Shared, ev: &CGEvent) -> bool {
    let flags = CGEvent::flags(Some(ev)).0 & MOD_FLAGS;
    let prev = PREV_FLAGS.replace(flags);
    if shared.mode() != GuardMode::All {
        return false;
    }
    // Un modificateur vient d'être enfoncé : c'est aussi un coup de patte.
    if flags & !prev != 0 {
        shared.intercepted(None);
    }
    true
}

fn system_defined(shared: &Shared, ev: &CGEvent) -> bool {
    let mode = shared.mode();
    if mode == GuardMode::Off || (mode == GuardMode::FKeys && !shared.media_keys()) {
        return false;
    }
    let Some(ns) = NSEvent::eventWithCGEvent(ev) else {
        return false;
    };
    if i64::from(ns.subtype().0) != AUX_CONTROL_BUTTONS {
        return false;
    }
    let data1 = ns.data1() as i64;
    let nx = (data1 & 0xFFFF_0000) >> 16;
    let first_press = (data1 & 0xFF00) >> 8 == 0x0A && data1 & 0x1 == 0;
    let key = macos_media_key(nx);
    if mode == GuardMode::FKeys {
        let Some(key) = key else {
            return false;
        };
        if !shared.is_blocked(key) {
            return false;
        }
    }
    if first_press {
        shared.intercepted(key);
    }
    true
}

fn decide(shared: &Shared, ty: CGEventType, ev: &CGEvent) -> bool {
    match ty {
        CGEventType::KeyDown => key_event(shared, ev, true),
        CGEventType::KeyUp => key_event(shared, ev, false),
        CGEventType::FlagsChanged => flags_changed(shared, ev),
        t if t.0 == SYSTEM_DEFINED => system_defined(shared, ev),
        _ => false,
    }
}

unsafe extern "C-unwind" fn tap_callback(
    _proxy: CGEventTapProxy,
    ty: CGEventType,
    event: NonNull<CGEvent>,
    _user_info: *mut c_void,
) -> *mut CGEvent {
    let pass = event.as_ptr();
    if ty == CGEventType::TapDisabledByTimeout || ty == CGEventType::TapDisabledByUserInput {
        if let Some(port) = NonNull::new(TAP.load(Ordering::Acquire)) {
            // SAFETY : le port reste vivant tant que le thread du tap tourne.
            CGEvent::tap_enable(unsafe { port.as_ref() }, true);
            log::info!("event tap réactivé après une coupure du système");
        }
        return pass;
    }
    let Some(shared) = SHARED.get() else {
        return pass;
    };
    // SAFETY : l'événement est valide pendant l'appel.
    let ev = unsafe { event.as_ref() };
    // Dans le doute (panic), on laisse passer la touche.
    let swallow = catch_unwind(AssertUnwindSafe(|| decide(shared, ty, ev))).unwrap_or(false);
    if swallow {
        null_mut()
    } else {
        pass
    }
}

fn trusted() -> bool {
    // SAFETY : fonction sans argument de l'API Accessibilité.
    unsafe { AXIsProcessTrusted() }
}

/// Crée le tap et fait tourner sa boucle (ne revient que si la création échoue).
fn run_tap(status: &Mutex<GuardStatus>) {
    let mask: CGEventMask = (1 << CGEventType::KeyDown.0)
        | (1 << CGEventType::KeyUp.0)
        | (1 << CGEventType::FlagsChanged.0)
        | (1 << SYSTEM_DEFINED);
    // SAFETY : le callback respecte la signature attendue et n'utilise pas user_info.
    let port = unsafe {
        CGEvent::tap_create(
            CGEventTapLocation::SessionEventTap,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            mask,
            Some(tap_callback),
            null_mut(),
        )
    };
    let Some(port) = port else {
        set(
            status,
            GuardStatus::Unavailable {
                reason: "macOS a refusé l’event tap. Vérifie l’autorisation Accessibilité, puis relance Pattelock.".into(),
            },
        );
        return;
    };
    TAP.store((&*port as *const CFMachPort).cast_mut(), Ordering::Release);
    let Some(source) = CFMachPort::new_run_loop_source(None, Some(&port), 0) else {
        set(
            status,
            GuardStatus::Unavailable {
                reason: "Boucle d’événements macOS indisponible.".into(),
            },
        );
        return;
    };
    let Some(run_loop) = CFRunLoop::current() else {
        return;
    };
    // SAFETY : constante fournie par CoreFoundation.
    run_loop.add_source(Some(&source), unsafe { kCFRunLoopCommonModes });
    CGEvent::tap_enable(&port, true);
    set(status, GuardStatus::Ok);
    log::info!("event tap macOS actif");
    CFRunLoop::run();
    // Le port doit vivre aussi longtemps que la boucle.
    drop(port);
}

fn set(status: &Mutex<GuardStatus>, s: GuardStatus) {
    if let Ok(mut cur) = status.lock() {
        *cur = s;
    }
}

struct MacGuard {
    status: Arc<Mutex<GuardStatus>>,
}

impl KeyGuard for MacGuard {
    fn status(&self) -> GuardStatus {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or(GuardStatus::Starting)
    }

    /// Ouvre Réglages Système, Confidentialité et sécurité, Accessibilité.
    fn retry(&self) {
        if self.status() == GuardStatus::NeedsAccessibility {
            if let Err(e) = Command::new("open").arg(SETTINGS_URL).spawn() {
                log::warn!("ouverture des Réglages Système impossible : {e}");
            }
        }
    }
}

pub fn start(shared: Arc<Shared>) -> Box<dyn KeyGuard> {
    let status = Arc::new(Mutex::new(GuardStatus::Starting));
    let _ = SHARED.set(shared);
    let thread_status = status.clone();
    let spawned = thread::Builder::new()
        .name("pattelock-keyguard".into())
        .spawn(move || loop {
            if !trusted() {
                set(&thread_status, GuardStatus::NeedsAccessibility);
                thread::sleep(Duration::from_secs(1));
                continue;
            }
            run_tap(&thread_status);
            // Échec : on réessaie un peu plus tard (permission tout juste donnée...).
            thread::sleep(Duration::from_secs(3));
        });
    if let Err(e) = spawned {
        set(
            &status,
            GuardStatus::Unavailable {
                reason: format!("Thread du blocage non démarré ({e})."),
            },
        );
    }
    Box::new(MacGuard { status })
}
