//! Wayland (et consoles) : capture des claviers avec `EVIOCGRAB` et réémission par un
//! clavier virtuel `uinput` de tout ce qui n'est pas bloqué.
//!
//! Chaque clavier a son thread, qui attend (`poll`) soit des événements, soit un signal
//! de changement de mode. Le clavier n'est capturé que si le blocage est actif : en
//! pause, on lit seulement les événements pour reconnaître le raccourci (le plugin
//! global-shortcut ne fonctionne pas sous Wayland). Le noyau relâche les claviers si le
//! processus meurt. Les claviers branchés en cours de route sont détectés (toutes les 2 s).

use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use evdev::uinput::VirtualDevice;
use evdev::{AttributeSet, Device, EventType, InputEvent, KeyCode};

use super::super::combo::{ComboEvent, ModKey, ModTracker};
use super::super::keys::from_evdev_key;
use super::super::{GuardMode, GuardStatus, KeyGuard, Reason, Shared};

const VIRTUAL_NAME: &str = "Pattelock virtual keyboard";
const RULES_INSTALLED: &str = "/usr/lib/udev/rules.d/70-pattelock.rules";
const RESCAN: Duration = Duration::from_secs(2);

/// Commande à lancer quand les droits manquent (affichée dans l'UI).
pub fn setup_command(rules_installed: bool) -> String {
    let group = "sudo usermod -aG input $USER";
    if rules_installed {
        return group.into();
    }
    [
        "echo 'KERNEL==\"uinput\", SUBSYSTEM==\"misc\", GROUP=\"input\", MODE=\"0660\", OPTIONS+=\"static_node=uinput\"' | sudo tee /etc/udev/rules.d/70-pattelock.rules",
        "echo uinput | sudo tee /etc/modules-load.d/pattelock.conf",
        "sudo modprobe uinput",
        "sudo udevadm control --reload-rules",
        "sudo udevadm trigger",
        group,
    ]
    .join(" && ")
}

fn modifier(code: u16) -> Option<ModKey> {
    Some(match code {
        29 => ModKey::CtrlL,  // KEY_LEFTCTRL
        97 => ModKey::CtrlR,  // KEY_RIGHTCTRL
        56 => ModKey::AltL,   // KEY_LEFTALT
        100 => ModKey::AltR,  // KEY_RIGHTALT
        42 => ModKey::ShiftL, // KEY_LEFTSHIFT
        54 => ModKey::ShiftR, // KEY_RIGHTSHIFT
        125 => ModKey::MetaL, // KEY_LEFTMETA
        126 => ModKey::MetaR, // KEY_RIGHTMETA
        _ => return None,
    })
}

/// Ce qu'il faut faire d'un événement touche.
#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    Forward,
    Swallow,
}

/// Décide du sort d'une touche (`value` : 0 relâchée, 1 enfoncée, 2 répétition) et
/// signale interceptions et raccourci. Fonction pure, testée sans périphérique.
pub fn judge(shared: &Shared, tracker: &mut ModTracker, code: u16, value: i32) -> Verdict {
    let combo = tracker.handle(modifier(code), u32::from(code), value == 1, shared.unlock());
    if combo == ComboEvent::Unlock && !shared.capturing() {
        // Sous Wayland, le raccourci est toujours reconnu ici, quel que soit le mode.
        shared.unlock_pressed();
        return Verdict::Swallow;
    }
    let key = from_evdev_key(code);
    match shared.mode() {
        GuardMode::Off => Verdict::Forward,
        GuardMode::FKeys => match key {
            Some(k) if shared.is_blocked(k) => {
                if value == 1 {
                    shared.intercepted(Some(k));
                }
                Verdict::Swallow
            }
            _ => Verdict::Forward,
        },
        GuardMode::All => {
            if value == 1 {
                shared.intercepted(key);
            }
            Verdict::Swallow
        }
    }
}

fn is_keyboard(dev: &Device) -> bool {
    if dev.name() == Some(VIRTUAL_NAME) {
        return false;
    }
    dev.supported_keys().is_some_and(|keys| {
        (keys.contains(KeyCode::KEY_A) && keys.contains(KeyCode::KEY_ENTER))
            || keys.contains(KeyCode::KEY_F1)
    })
}

fn build_virtual() -> std::io::Result<VirtualDevice> {
    let mut keys = AttributeSet::<KeyCode>::new();
    for code in 1..=248u16 {
        keys.insert(KeyCode::new(code));
    }
    VirtualDevice::builder()?
        .name(VIRTUAL_NAME)
        .with_keys(&keys)?
        .build()
}

struct Inner {
    shared: Arc<Shared>,
    virt: Mutex<VirtualDevice>,
    /// Un bout de socket par clavier suivi, pour le réveiller quand le mode change.
    wakers: Mutex<Vec<UnixStream>>,
    tracked: Mutex<HashSet<PathBuf>>,
    status: Mutex<GuardStatus>,
}

impl Inner {
    fn set_status(&self, s: GuardStatus) {
        if let Ok(mut cur) = self.status.lock() {
            *cur = s;
        }
    }

    fn wake_all(&self) {
        if let Ok(mut wakers) = self.wakers.lock() {
            // Les threads de claviers débranchés ont fermé leur bout : on les oublie.
            wakers.retain_mut(|w| w.write_all(&[1]).is_ok());
        }
    }

    /// Cherche les nouveaux claviers et lance un thread pour chacun.
    fn scan(self: &Arc<Self>) {
        let mut found = 0;
        for (path, dev) in evdev::enumerate() {
            if !is_keyboard(&dev) {
                continue;
            }
            found += 1;
            let new = self
                .tracked
                .lock()
                .map(|mut t| t.insert(path.clone()))
                .unwrap_or(false);
            if new {
                self.spawn_device(path, dev);
            }
        }
        let current = self.status.lock().map(|s| s.clone()).ok();
        if found == 0 {
            self.set_status(GuardStatus::unavailable(Reason::NoKeyboard));
        } else if current != Some(GuardStatus::Ok) {
            self.set_status(GuardStatus::Ok);
        }
    }

    fn spawn_device(self: &Arc<Self>, path: PathBuf, dev: Device) {
        let (wake_tx, wake_rx) = match UnixStream::pair() {
            Ok(p) => p,
            Err(e) => {
                log::warn!("clavier {path:?} ignoré : {e}");
                return;
            }
        };
        if let Ok(mut w) = self.wakers.lock() {
            w.push(wake_tx);
        }
        let inner = self.clone();
        let spawned = thread::Builder::new()
            .name("pattelock-evdev".into())
            .spawn(move || {
                log::info!(
                    "clavier suivi : {:?} ({})",
                    dev.name().unwrap_or("?"),
                    path.display()
                );
                device_loop(&inner, dev, wake_rx);
                log::info!("clavier débranché : {}", path.display());
                if let Ok(mut t) = inner.tracked.lock() {
                    t.remove(&path);
                }
            });
        if let Err(e) = spawned {
            log::warn!("thread clavier non démarré : {e}");
        }
    }
}

fn device_loop(inner: &Inner, mut dev: Device, mut wake: UnixStream) {
    if dev.set_nonblocking(true).is_err() || wake.set_nonblocking(true).is_err() {
        return;
    }
    let mut tracker = ModTracker::default();
    let mut grabbed = false;
    loop {
        // Capture seulement si le blocage est actif.
        let want = inner.shared.mode() != GuardMode::Off;
        if want != grabbed {
            let res = if want { dev.grab() } else { dev.ungrab() };
            match res {
                Ok(()) => grabbed = want,
                Err(e) => log::warn!("capture du clavier impossible : {e}"),
            }
            tracker.reset();
        }

        let mut fds = [
            libc::pollfd {
                fd: dev.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            },
            libc::pollfd {
                fd: wake.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            },
        ];
        // SAFETY : tableau valide de 2 pollfd possédés par ce thread.
        let n = unsafe { libc::poll(fds.as_mut_ptr(), 2, -1) };
        if n < 0 {
            if std::io::Error::last_os_error().kind() == ErrorKind::Interrupted {
                continue;
            }
            return;
        }
        if fds[1].revents != 0 {
            let mut buf = [0u8; 64];
            while matches!(wake.read(&mut buf), Ok(n) if n > 0) {}
            if fds[1].revents & (libc::POLLHUP | libc::POLLERR) != 0 {
                return;
            }
        }
        if fds[0].revents & (libc::POLLHUP | libc::POLLERR | libc::POLLNVAL) != 0 {
            return;
        }
        if fds[0].revents & libc::POLLIN == 0 {
            continue;
        }
        let events: Vec<InputEvent> = match dev.fetch_events() {
            Ok(evs) => evs.collect(),
            Err(e) if e.kind() == ErrorKind::WouldBlock => continue,
            Err(_) => return,
        };
        let mut out = Vec::with_capacity(events.len());
        for ev in events {
            if ev.event_type() != EventType::KEY {
                continue;
            }
            if judge(&inner.shared, &mut tracker, ev.code(), ev.value()) == Verdict::Forward {
                out.push(ev);
            }
        }
        if grabbed && !out.is_empty() {
            if let Ok(mut v) = inner.virt.lock() {
                if let Err(e) = v.emit(&out) {
                    log::warn!("réémission impossible : {e}");
                }
            }
        }
    }
}

struct EvdevGuard(Arc<Inner>);

impl KeyGuard for EvdevGuard {
    fn status(&self) -> GuardStatus {
        self.0
            .status
            .lock()
            .map(|s| s.clone())
            .unwrap_or(GuardStatus::Starting)
    }

    fn update(&self) {
        self.0.wake_all();
    }

    fn detects_shortcut(&self) -> bool {
        true
    }
}

/// Droits manquants : on vérifie périodiquement s'ils sont arrivés (après reconnexion,
/// ils le seront au prochain lancement de toute façon).
struct NeedsRights(Mutex<GuardStatus>);

impl KeyGuard for NeedsRights {
    fn status(&self) -> GuardStatus {
        self.0
            .lock()
            .map(|s| s.clone())
            .unwrap_or(GuardStatus::Starting)
    }
}

fn can_write(path: &Path) -> bool {
    OpenOptions::new().write(true).open(path).is_ok()
}

pub fn start(shared: Arc<Shared>) -> Box<dyn KeyGuard> {
    let readable = evdev::enumerate().any(|(_, d)| is_keyboard(&d));
    if !readable || !can_write(Path::new("/dev/uinput")) {
        let command = setup_command(Path::new(RULES_INSTALLED).exists());
        log::warn!("accès à /dev/input ou /dev/uinput refusé");
        return Box::new(NeedsRights(Mutex::new(GuardStatus::NeedsInputGroup {
            command,
        })));
    }
    let virt = match build_virtual() {
        Ok(v) => v,
        Err(e) => return Box::new(super::Unavailable(Reason::UinputFailed, e.to_string())),
    };
    let inner = Arc::new(Inner {
        shared,
        virt: Mutex::new(virt),
        wakers: Mutex::new(Vec::new()),
        tracked: Mutex::new(HashSet::new()),
        status: Mutex::new(GuardStatus::Starting),
    });
    inner.scan();
    let scanner = inner.clone();
    let _ = thread::Builder::new()
        .name("pattelock-evdev-scan".into())
        .spawn(move || loop {
            thread::sleep(RESCAN);
            scanner.scan();
        });
    Box::new(EvdevGuard(inner))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keyguard::keys::{evdev_key, mask_of, BlockableKey};
    use crate::keyguard::GuardEvent;
    use crate::shortcut::Shortcut;

    fn shared(mode: GuardMode) -> (Shared, std::sync::mpsc::Receiver<GuardEvent>) {
        let (s, rx) = Shared::new();
        s.set(
            mode,
            mask_of(&[BlockableKey::F1]),
            &Shortcut::default(),
            true,
        );
        (s, rx)
    }

    #[test]
    fn fkeys_mode_swallows_only_blocked_keys() {
        let (s, rx) = shared(GuardMode::FKeys);
        let mut t = ModTracker::default();
        let f1 = evdev_key(BlockableKey::F1);
        let f2 = evdev_key(BlockableKey::F2);
        assert_eq!(judge(&s, &mut t, f1, 1), Verdict::Swallow);
        assert_eq!(judge(&s, &mut t, f1, 2), Verdict::Swallow);
        assert_eq!(judge(&s, &mut t, f1, 0), Verdict::Swallow);
        assert_eq!(judge(&s, &mut t, f2, 1), Verdict::Forward);
        assert_eq!(judge(&s, &mut t, 30, 1), Verdict::Forward);
        // Une seule interception : pas la répétition, pas le relâchement.
        assert_eq!(rx.try_recv(), Ok(GuardEvent::Intercepted { key: "F1" }));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn all_mode_swallows_everything_but_detects_unlock() {
        let (s, rx) = shared(GuardMode::All);
        let mut t = ModTracker::default();
        assert_eq!(judge(&s, &mut t, 29, 1), Verdict::Swallow); // Ctrl
        assert_eq!(judge(&s, &mut t, 56, 1), Verdict::Swallow); // Alt
        assert_eq!(judge(&s, &mut t, 37, 1), Verdict::Swallow); // K
        let events: Vec<_> = rx.try_iter().collect();
        // Ctrl et Alt comptés comme coups de patte, puis le raccourci reconnu.
        assert_eq!(events.len(), 3);
        assert_eq!(events.last(), Some(&GuardEvent::Unlock));
    }

    #[test]
    fn off_mode_forwards_and_still_detects_shortcut() {
        let (s, rx) = shared(GuardMode::Off);
        let mut t = ModTracker::default();
        assert_eq!(
            judge(&s, &mut t, evdev_key(BlockableKey::F1), 1),
            Verdict::Forward
        );
        judge(&s, &mut t, 29, 1);
        judge(&s, &mut t, 56, 1);
        judge(&s, &mut t, 37, 1);
        assert!(rx.try_iter().any(|e| e == GuardEvent::Unlock));
    }

    #[test]
    fn setup_command_mentions_group_and_rule() {
        assert_eq!(setup_command(true), "sudo usermod -aG input $USER");
        let full = setup_command(false);
        assert!(full.contains("70-pattelock.rules"));
        assert!(full.ends_with("sudo usermod -aG input $USER"));
    }
}
