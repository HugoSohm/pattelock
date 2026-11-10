//! Blocage des touches au niveau du système : un hook par OS qui avale les événements
//! clavier pour qu'aucune autre application ne les reçoive.
//!
//! Le hook tourne sur son propre thread et ne lit que des atomics (`Shared`) : jamais de
//! verrou, jamais d'appel à Tauri. Il signale les touches interceptées par un canal non
//! bloquant, traité par un autre thread. En mode `All`, il reconnaît lui-même la
//! combinaison de déverrouillage (le plugin global-shortcut ne recevrait plus rien).
//!
//! Si le hook plante ou que l'app se ferme, l'OS retire le hook (Windows, macOS), ferme
//! la connexion X (X11) ou relâche les périphériques (evdev) : le blocage disparaît.

pub mod combo;
pub mod keys;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TrySendError};

use serde::Serialize;

use crate::custom_keys::MAX_CUSTOM;
use crate::shortcut::Shortcut;
use crate::state::Mode;

/// Identifiant envoyé au front pour une touche supplémentaire interceptée.
pub const CUSTOM_ID: &str = "custom";
use combo::Unlock;
use keys::{keys_of, BlockableKey};

/// Mode lu par le hook.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GuardMode {
    Off = 0,
    FKeys = 1,
    All = 2,
}

impl From<Mode> for GuardMode {
    fn from(m: Mode) -> Self {
        match m {
            Mode::Off => Self::Off,
            Mode::Fkeys => Self::FKeys,
            Mode::All => Self::All,
        }
    }
}

/// Ce que le hook signale au reste de l'app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuardEvent {
    /// Une touche a été avalée. `key` : identifiant de la bande (`F5`) ou `other`.
    Intercepted { key: &'static str },
    /// La combinaison de déverrouillage a été pressée en mode `All`.
    Unlock,
}

/// État du blocage, affiché dans l'UI.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GuardStatus {
    Ok,
    Starting,
    /// macOS : la permission Accessibilité manque.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NeedsAccessibility,
    /// Linux Wayland : accès à /dev/input et /dev/uinput manquant.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    NeedsInputGroup {
        command: String,
    },
    /// Blocage impossible. Le front traduit la raison ; `detail` donne l'erreur système.
    Unavailable {
        reason: Reason,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
    /// Certaines touches n'ont pas pu être bloquées (déjà prises par le système).
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    Partial {
        unavailable: Vec<BlockableKey>,
        /// Touches supplémentaires refusées, en codes natifs (remplis par le hook).
        #[serde(skip)]
        custom_natives: Vec<u32>,
        /// Les mêmes en `KeyboardEvent.code` (remplis par `Core` pour le front).
        #[serde(skip_serializing_if = "Vec::is_empty")]
        custom: Vec<String>,
    },
}

/// Pourquoi le blocage est impossible (codes traduits par le front).
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Reason {
    #[cfg_attr(
        any(windows, target_os = "macos", target_os = "linux"),
        allow(dead_code)
    )]
    Unsupported,
    #[cfg_attr(not(windows), allow(dead_code))]
    AlreadyInstalled,
    #[cfg_attr(not(windows), allow(dead_code))]
    HookRefused,
    #[cfg_attr(target_os = "linux", allow(dead_code))]
    ThreadFailed,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    TapRefused,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    RunLoop,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    X11Lost,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    KeyboardBusy,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    UinputFailed,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    NoKeyboard,
}

impl GuardStatus {
    pub fn unavailable(reason: Reason) -> Self {
        Self::Unavailable {
            reason,
            detail: None,
        }
    }

    #[cfg_attr(target_os = "linux", allow(dead_code))]
    pub fn unavailable_with(reason: Reason, detail: impl std::fmt::Display) -> Self {
        Self::Unavailable {
            reason,
            detail: Some(detail.to_string()),
        }
    }
}

/// Case vide du tableau des touches supplémentaires (aucun code natif ne vaut ça).
const NO_KEY: u32 = u32::MAX;

/// État partagé entre l'app et le hook.
pub struct Shared {
    mode: AtomicU8,
    mask: AtomicU32,
    /// Codes natifs des touches supplémentaires (`NO_KEY` pour les cases vides). Un
    /// tableau fixe : le hook le parcourt sans verrou ni allocation.
    custom: [AtomicU32; MAX_CUSTOM],
    unlock: AtomicU64,
    media_keys: AtomicBool,
    /// Un nouveau raccourci est en cours d'enregistrement : on ne le reconnaît pas.
    capturing: AtomicBool,
    events: SyncSender<GuardEvent>,
}

impl Shared {
    pub fn new() -> (Self, Receiver<GuardEvent>) {
        let (tx, rx) = sync_channel(256);
        let shared = Self {
            mode: AtomicU8::new(GuardMode::Off as u8),
            mask: AtomicU32::new(0),
            custom: std::array::from_fn(|_| AtomicU32::new(NO_KEY)),
            unlock: AtomicU64::new(Unlock::default().pack()),
            media_keys: AtomicBool::new(true),
            capturing: AtomicBool::new(false),
            events: tx,
        };
        (shared, rx)
    }

    pub fn mode(&self) -> GuardMode {
        match self.mode.load(Ordering::Acquire) {
            1 => GuardMode::FKeys,
            2 => GuardMode::All,
            _ => GuardMode::Off,
        }
    }

    pub fn mask(&self) -> u32 {
        self.mask.load(Ordering::Acquire)
    }

    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    pub fn blocked_keys(&self) -> Vec<BlockableKey> {
        keys_of(self.mask())
    }

    #[cfg_attr(windows, allow(dead_code))]
    pub fn is_blocked(&self, key: BlockableKey) -> bool {
        self.mode() == GuardMode::FKeys && self.mask() & key.bit() != 0
    }

    /// Le code natif est-il une touche supplémentaire bloquée en ce moment ? Pas pendant
    /// l'enregistrement d'un raccourci : un modificateur avalé en serait absent.
    pub fn blocks_custom(&self, native: u32) -> bool {
        native != NO_KEY
            && self.mode() == GuardMode::FKeys
            && !self.capturing()
            && self
                .custom
                .iter()
                .any(|c| c.load(Ordering::Acquire) == native)
    }

    /// Codes natifs des touches supplémentaires (hors du hook : alloue).
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    pub fn custom_natives(&self) -> Vec<u32> {
        self.custom
            .iter()
            .map(|c| c.load(Ordering::Acquire))
            .filter(|c| *c != NO_KEY)
            .collect()
    }

    pub fn unlock(&self) -> Unlock {
        Unlock::unpack(self.unlock.load(Ordering::Acquire))
    }

    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub fn media_keys(&self) -> bool {
        self.media_keys.load(Ordering::Acquire)
    }

    pub fn capturing(&self) -> bool {
        self.capturing.load(Ordering::Acquire)
    }

    pub fn set_capturing(&self, capturing: bool) {
        self.capturing.store(capturing, Ordering::Release);
    }

    pub fn set(
        &self,
        mode: GuardMode,
        mask: u32,
        custom: &[u32],
        shortcut: &Shortcut,
        media_keys: bool,
    ) {
        self.mask.store(mask, Ordering::Release);
        for (i, slot) in self.custom.iter().enumerate() {
            slot.store(custom.get(i).copied().unwrap_or(NO_KEY), Ordering::Release);
        }
        self.unlock
            .store(Unlock::from_shortcut(shortcut).pack(), Ordering::Release);
        self.media_keys.store(media_keys, Ordering::Release);
        self.mode.store(mode as u8, Ordering::Release);
    }

    /// Signale une interception sans jamais bloquer le hook (événement perdu si la file
    /// est pleine, ce qui n'arrive que si le chat tape plus vite que l'app ne lit).
    pub fn intercepted(&self, key: Option<BlockableKey>) {
        self.send(GuardEvent::Intercepted {
            key: key.map_or("other", BlockableKey::id),
        });
    }

    /// Une touche supplémentaire a été avalée.
    pub fn intercepted_custom(&self) {
        self.send(GuardEvent::Intercepted { key: CUSTOM_ID });
    }

    pub fn unlock_pressed(&self) {
        self.send(GuardEvent::Unlock);
    }

    fn send(&self, ev: GuardEvent) {
        match self.events.try_send(ev) {
            Ok(()) | Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => {}
        }
    }
}

/// Interface commune aux implémentations par OS.
pub trait KeyGuard: Send + Sync {
    /// État actuel (permissions, touches indisponibles...).
    fn status(&self) -> GuardStatus;
    /// L'état partagé vient de changer (mode, touches, raccourci). Les implémentations
    /// qui lisent les atomics à chaque touche n'ont rien à faire.
    fn update(&self) {}
    /// Vérifie à nouveau les permissions (macOS, Linux) et relance le hook si possible.
    fn retry(&self) {}
    /// Le hook reconnaît-il lui-même le raccourci dans tous les modes ? (evdev sous
    /// Wayland, où le plugin global-shortcut ne fonctionne pas.)
    fn detects_shortcut(&self) -> bool {
        false
    }
}

/// Démarre le hook de l'OS courant.
pub fn start(shared: std::sync::Arc<Shared>) -> Box<dyn KeyGuard> {
    #[cfg(windows)]
    return windows::start(shared);
    #[cfg(target_os = "macos")]
    return macos::start(shared);
    #[cfg(target_os = "linux")]
    return linux::start(shared);
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = shared;
        Box::new(Unsupported)
    }
}

/// OS sans implémentation : l'app fonctionne, mais rien n'est bloqué.
#[allow(dead_code)]
struct Unsupported;

impl KeyGuard for Unsupported {
    fn status(&self) -> GuardStatus {
        GuardStatus::unavailable(Reason::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_reflects_mode_and_mask() {
        let (s, rx) = Shared::new();
        assert_eq!(s.mode(), GuardMode::Off);
        let mask = BlockableKey::F1.bit() | BlockableKey::Pause.bit();
        s.set(
            GuardMode::FKeys,
            mask,
            &[30, 57],
            &Shortcut::default(),
            false,
        );
        assert!(s.is_blocked(BlockableKey::F1));
        assert!(!s.is_blocked(BlockableKey::F2));
        assert!(!s.media_keys());
        assert!(s.blocks_custom(30));
        assert!(s.blocks_custom(57));
        assert!(!s.blocks_custom(31));
        assert!(!s.blocks_custom(NO_KEY));
        assert_eq!(s.custom_natives(), vec![30, 57]);
        s.set(GuardMode::Off, mask, &[30], &Shortcut::default(), true);
        assert!(!s.is_blocked(BlockableKey::F1));
        assert!(!s.blocks_custom(30));
        assert_eq!(s.custom_natives(), vec![30]);
        s.set(GuardMode::FKeys, mask, &[], &Shortcut::default(), true);
        assert!(!s.blocks_custom(30));
        s.intercepted_custom();
        assert_eq!(rx.try_recv(), Ok(GuardEvent::Intercepted { key: "custom" }));

        s.intercepted(Some(BlockableKey::F5));
        s.intercepted(None);
        s.unlock_pressed();
        assert_eq!(rx.try_recv(), Ok(GuardEvent::Intercepted { key: "F5" }));
        assert_eq!(rx.try_recv(), Ok(GuardEvent::Intercepted { key: "other" }));
        assert_eq!(rx.try_recv(), Ok(GuardEvent::Unlock));
    }

    #[test]
    fn sending_never_blocks_when_queue_is_full() {
        let (s, _rx) = Shared::new();
        for _ in 0..10_000 {
            s.intercepted(None);
        }
    }

    #[test]
    fn status_json_matches_front() {
        let v = serde_json::to_value(GuardStatus::NeedsInputGroup {
            command: "x".into(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "needsInputGroup", "command": "x"})
        );
        let v = serde_json::to_value(GuardStatus::Ok).unwrap();
        assert_eq!(v, serde_json::json!({"kind": "ok"}));
        let v = serde_json::to_value(GuardStatus::unavailable(Reason::X11Lost)).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "unavailable", "reason": "x11Lost"})
        );
        let v = serde_json::to_value(GuardStatus::unavailable_with(
            Reason::HookRefused,
            "accès refusé",
        ))
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "unavailable", "reason": "hookRefused", "detail": "accès refusé"})
        );
        let v = serde_json::to_value(GuardStatus::Partial {
            unavailable: vec![BlockableKey::PrintScreen],
            custom_natives: vec![30],
            custom: Vec::new(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "partial", "unavailable": ["PrintScreen"]})
        );
        let v = serde_json::to_value(GuardStatus::Partial {
            unavailable: Vec::new(),
            custom_natives: vec![30],
            custom: vec!["KeyA".into()],
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "partial", "unavailable": [], "custom": ["KeyA"]})
        );
    }
}
