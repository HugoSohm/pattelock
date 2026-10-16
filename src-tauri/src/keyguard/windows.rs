//! Windows : hook clavier bas niveau (`SetWindowsHookExW(WH_KEYBOARD_LL)`).
//!
//! Le hook est installé sur un thread dédié qui fait tourner une boucle de messages
//! (obligatoire pour que Windows appelle le hook). Pour avaler une touche, la procédure
//! renvoie `LRESULT(1)` ; sinon elle passe la main à `CallNextHookEx`.
//!
//! Le hook n'existe que pendant un mode de blocage : en mode `Off`, il est retiré et
//! Windows ne transmet aucune frappe à l'app. `update` réveille le thread du hook, qui
//! l'installe ou le retire selon le mode.
//!
//! Le hook est retiré automatiquement par Windows si le thread ou le processus meurt.
//! Limites : Ctrl+Alt+Suppr et Win+L restent actifs (gérés par le système), et quand une
//! fenêtre lancée en administrateur a le focus, Windows n'appelle pas le hook.

use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT,
    LLKHF_EXTENDED, LLKHF_INJECTED, MSG, PM_NOREMOVE, WH_KEYBOARD_LL, WM_APP, WM_KEYDOWN,
    WM_SYSKEYDOWN,
};

use super::combo::{windows_native, ComboEvent, ModKey, ModTracker};
use super::keys::from_windows;
use super::{GuardMode, GuardStatus, KeyGuard, Reason, Shared};

/// État partagé lu par la procédure du hook (une seule instance par processus).
static SHARED: OnceLock<Arc<Shared>> = OnceLock::new();

/// En debug, `PATTELOCK_BLOCK_INJECTED=1` traite aussi les touches simulées (tests).
static BLOCK_INJECTED: OnceLock<bool> = OnceLock::new();

/// Message posté au thread du hook : le mode a changé.
const WM_SYNC: u32 = WM_APP + 1;

thread_local! {
    /// Modificateurs et touches enfoncés, vus par le hook (thread du hook uniquement).
    static KEYS: RefCell<KeyState> = RefCell::new(KeyState::default());
    /// Hook installé (thread du hook uniquement).
    static HOOK: Cell<Option<HHOOK>> = const { Cell::new(None) };
}

struct KeyState {
    mods: ModTracker,
    /// Touches déjà enfoncées : on ne compte pas la répétition automatique.
    down: [bool; 256],
}

impl Default for KeyState {
    fn default() -> Self {
        Self {
            mods: ModTracker::default(),
            down: [false; 256],
        }
    }
}

fn modifier(vk: u32) -> Option<ModKey> {
    Some(match vk {
        0xA2 => ModKey::CtrlL,  // VK_LCONTROL
        0xA3 => ModKey::CtrlR,  // VK_RCONTROL
        0xA4 => ModKey::AltL,   // VK_LMENU
        0xA5 => ModKey::AltR,   // VK_RMENU
        0xA0 => ModKey::ShiftL, // VK_LSHIFT
        0xA1 => ModKey::ShiftR, // VK_RSHIFT
        0x5B => ModKey::MetaL,  // VK_LWIN
        0x5C => ModKey::MetaR,  // VK_RWIN
        _ => return None,
    })
}

/// Décide si l'événement doit être avalé. Ne bloque jamais, n'alloue pas.
fn decide(shared: &Shared, kb: &KBDLLHOOKSTRUCT, down: bool) -> bool {
    let injected = kb.flags.0 & LLKHF_INJECTED.0 != 0;
    if injected && !BLOCK_INJECTED.get().copied().unwrap_or(false) {
        // Clavier visuel, outils d'accessibilité... : ce n'est pas le chat.
        return false;
    }
    let vk = kb.vkCode;
    let ext = kb.flags.0 & LLKHF_EXTENDED.0 != 0;
    let native = windows_native(kb.scanCode as u16, ext);
    let unlock = shared.unlock();

    KEYS.with_borrow_mut(|st| {
        let slot = (vk & 0xFF) as usize;
        let first_press = down && !st.down[slot];
        st.down[slot] = down;
        let combo = st.mods.handle(modifier(vk), native, down, unlock);

        match shared.mode() {
            GuardMode::Off => false,
            GuardMode::FKeys => {
                let Some(key) = from_windows(vk, kb.scanCode as u16, ext) else {
                    return false;
                };
                if shared.mask() & key.bit() == 0 {
                    return false;
                }
                if first_press {
                    shared.intercepted(Some(key));
                }
                true
            }
            GuardMode::All => {
                if combo == ComboEvent::Unlock {
                    shared.unlock_pressed();
                } else if first_press {
                    shared.intercepted(from_windows(vk, kb.scanCode as u16, ext));
                }
                // Tout est avalé, y compris les modificateurs (suivis ci-dessus).
                true
            }
        }
    })
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        if let Some(shared) = SHARED.get() {
            // SAFETY : pour WH_KEYBOARD_LL, lparam pointe vers un KBDLLHOOKSTRUCT valide
            // pendant l'appel.
            let kb = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
            let msg = wparam.0 as u32;
            let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            // Un panic ne doit jamais traverser la frontière FFI : dans le doute, on laisse
            // passer la touche.
            let swallow =
                catch_unwind(AssertUnwindSafe(|| decide(shared, kb, down))).unwrap_or(false);
            if swallow {
                return LRESULT(1);
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

struct WindowsGuard {
    status: Arc<Mutex<GuardStatus>>,
    /// Thread du hook, `None` s'il n'a pas démarré.
    thread_id: Option<u32>,
}

impl KeyGuard for WindowsGuard {
    fn status(&self) -> GuardStatus {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or(GuardStatus::Starting)
    }

    fn update(&self) {
        let Some(id) = self.thread_id else {
            return;
        };
        // SAFETY : simple envoi de message à un thread qui a une file de messages.
        if let Err(e) = unsafe { PostThreadMessageW(id, WM_SYNC, WPARAM(0), LPARAM(0)) } {
            log::warn!("thread du hook injoignable : {e}");
        }
    }
}

fn set_status(status: &Mutex<GuardStatus>, value: GuardStatus) {
    *status.lock().unwrap_or_else(|e| e.into_inner()) = value;
}

/// Installe le hook si un mode de blocage est actif, le retire sinon (thread du hook
/// uniquement). Un échec laisse passer les touches ; il est retenté au prochain changement.
fn sync(shared: &Shared, status: &Mutex<GuardStatus>) {
    let wanted = shared.mode() != GuardMode::Off;
    match (wanted, HOOK.get()) {
        (true, None) => {
            // Les touches enfoncées sans hook n'ont pas été vues : on repart de zéro.
            KEYS.with_borrow_mut(|st| *st = KeyState::default());
            // SAFETY : appels Win32 standards ; la procédure reste valide toute la vie du
            // processus.
            let hook = unsafe {
                let module = GetModuleHandleW(None).ok().map(Into::into);
                SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), module, 0)
            };
            match hook {
                Ok(h) => {
                    HOOK.set(Some(h));
                    log::info!("hook clavier installé");
                    set_status(status, GuardStatus::Ok);
                }
                Err(e) => set_status(
                    status,
                    GuardStatus::unavailable_with(Reason::HookRefused, e),
                ),
            }
        }
        (false, Some(h)) => {
            HOOK.set(None);
            // SAFETY : `h` vient de SetWindowsHookExW sur ce thread et n'a pas été retiré.
            match unsafe { UnhookWindowsHookEx(h) } {
                Ok(()) => log::info!("hook clavier retiré"),
                Err(e) => log::warn!("retrait du hook clavier impossible : {e}"),
            }
        }
        _ => {}
    }
}

pub fn start(shared: Arc<Shared>) -> Box<dyn KeyGuard> {
    let status = Arc::new(Mutex::new(GuardStatus::Starting));
    let block_injected =
        cfg!(debug_assertions) && std::env::var("PATTELOCK_BLOCK_INJECTED").as_deref() == Ok("1");
    if block_injected {
        log::warn!("debug : les touches simulées sont traitées comme réelles");
    }
    let _ = BLOCK_INJECTED.set(block_injected);
    if SHARED.set(shared.clone()).is_err() {
        set_status(&status, GuardStatus::unavailable(Reason::AlreadyInstalled));
        return Box::new(WindowsGuard {
            status,
            thread_id: None,
        });
    }

    let (tx, rx) = channel();
    let thread_status = status.clone();
    let spawned = thread::Builder::new()
        .name("pattelock-keyguard".into())
        .spawn(move || {
            let mut msg = MSG::default();
            // SAFETY : `msg` est un MSG valide possédé par ce thread. Ce premier appel crée
            // la file de messages du thread, pour que `update` puisse y poster.
            unsafe {
                let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
            }
            set_status(&thread_status, GuardStatus::Ok);
            sync(&shared, &thread_status);
            // SAFETY : sans effet de bord.
            let _ = tx.send(unsafe { GetCurrentThreadId() });
            // Boucle de messages : indispensable pour que le hook soit appelé.
            // SAFETY : `msg` est un MSG valide possédé par ce thread.
            unsafe {
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    if msg.hwnd.is_invalid() && msg.message == WM_SYNC {
                        sync(&shared, &thread_status);
                        continue;
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        });
    let thread_id = match spawned {
        Ok(_) => rx.recv_timeout(Duration::from_secs(2)).ok(),
        Err(e) => {
            set_status(
                &status,
                GuardStatus::unavailable_with(Reason::ThreadFailed, e),
            );
            None
        }
    };
    Box::new(WindowsGuard { status, thread_id })
}
