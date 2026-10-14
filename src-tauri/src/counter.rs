//! Compteur total de touches interceptées (« coups de patte évités »).
//!
//! Il est incrémenté côté Rust à chaque interception et écrit sur disque de façon
//! groupée : quelques secondes après la dernière touche, ou au plus tard après un délai
//! maximal si le chat tape sans arrêt. Il n'est jamais remis à zéro.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Délai sans nouvelle touche avant d'écrire.
pub const FLUSH_DEBOUNCE: Duration = Duration::from_secs(2);
/// Délai maximal entre deux écritures quand des touches arrivent en continu.
pub const FLUSH_MAX_DELAY: Duration = Duration::from_secs(15);

#[derive(Default)]
struct Pending {
    first_change: Option<Instant>,
    last_change: Option<Instant>,
    persisted: u64,
}

pub struct Counter {
    total: AtomicU64,
    pending: Mutex<Pending>,
}

impl Counter {
    pub fn new(initial: u64) -> Self {
        Self {
            total: AtomicU64::new(initial),
            pending: Mutex::new(Pending {
                persisted: initial,
                ..Pending::default()
            }),
        }
    }

    pub fn total(&self) -> u64 {
        self.total.load(Ordering::Relaxed)
    }

    /// Ajoute une touche interceptée et renvoie le nouveau total.
    pub fn increment(&self, now: Instant) -> u64 {
        let total = self.total.fetch_add(1, Ordering::Relaxed).saturating_add(1);
        if let Ok(mut p) = self.pending.lock() {
            p.first_change.get_or_insert(now);
            p.last_change = Some(now);
        }
        total
    }

    /// Faut-il écrire maintenant ?
    pub fn should_flush(&self, now: Instant) -> bool {
        let Ok(p) = self.pending.lock() else {
            return false;
        };
        match (p.first_change, p.last_change) {
            (Some(first), Some(last)) => {
                now.duration_since(last) >= FLUSH_DEBOUNCE
                    || now.duration_since(first) >= FLUSH_MAX_DELAY
            }
            _ => false,
        }
    }

    /// Écrit le total avec `persist` s'il a changé depuis la dernière écriture réussie.
    /// `force` ignore le délai (fermeture de l'app).
    pub fn flush<E>(
        &self,
        now: Instant,
        force: bool,
        persist: impl FnOnce(u64) -> Result<(), E>,
    ) -> Result<bool, E> {
        if !force && !self.should_flush(now) {
            return Ok(false);
        }
        let total = self.total();
        let unchanged = self
            .pending
            .lock()
            .map(|p| p.persisted == total)
            .unwrap_or(false);
        if unchanged {
            self.clear(total);
            return Ok(false);
        }
        persist(total)?;
        self.clear(total);
        Ok(true)
    }

    fn clear(&self, persisted: u64) {
        if let Ok(mut p) = self.pending.lock() {
            p.persisted = persisted;
            // Des touches ont pu arriver pendant l'écriture : on garde la demande.
            if self.total() == persisted {
                p.first_change = None;
                p.last_change = None;
            }
        }
    }
}

/// Limite le nombre d'événements envoyés au front (≈ 10 par seconde).
pub struct Throttle {
    interval: Duration,
    last: Option<Instant>,
}

impl Throttle {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            last: None,
        }
    }

    pub fn allow(&mut self, now: Instant) -> bool {
        match self.last {
            Some(l) if now.duration_since(l) < self.interval => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    #[test]
    fn increments_from_persisted_value() {
        let c = Counter::new(1284);
        let t = Instant::now();
        assert_eq!(c.increment(t), 1285);
        assert_eq!(c.increment(t), 1286);
        assert_eq!(c.total(), 1286);
    }

    #[test]
    fn writes_after_debounce_not_on_every_key() {
        let c = Counter::new(0);
        let t0 = Instant::now();
        let writes = RefCell::new(Vec::new());
        let persist = |v: u64| -> Result<(), ()> {
            writes.borrow_mut().push(v);
            Ok(())
        };

        for i in 0..50 {
            c.increment(t0 + ms(i * 10));
        }
        let last = t0 + ms(490);
        assert_eq!(c.flush(last + ms(100), false, persist), Ok(false));
        assert_eq!(c.flush(last + FLUSH_DEBOUNCE, false, persist), Ok(true));
        assert_eq!(*writes.borrow(), vec![50]);
        // Rien de nouveau : pas d'écriture.
        assert_eq!(c.flush(last + ms(10_000), false, persist), Ok(false));
        assert_eq!(writes.borrow().len(), 1);
    }

    #[test]
    fn writes_at_least_every_max_delay_under_continuous_typing() {
        let c = Counter::new(10);
        let t0 = Instant::now();
        let mut t = t0;
        while t.duration_since(t0) < FLUSH_MAX_DELAY {
            c.increment(t);
            assert!(!c.should_flush(t));
            t += ms(500);
        }
        c.increment(t);
        assert!(c.should_flush(t));
    }

    #[test]
    fn failed_write_is_retried() {
        let c = Counter::new(0);
        let t0 = Instant::now();
        c.increment(t0);
        let later = t0 + FLUSH_DEBOUNCE;
        assert_eq!(
            c.flush(later, false, |_| Err("disque plein")),
            Err("disque plein")
        );
        let mut saved = 0;
        assert_eq!(
            c.flush(later, false, |v| {
                saved = v;
                Ok::<(), ()>(())
            }),
            Ok(true)
        );
        assert_eq!(saved, 1);
    }

    #[test]
    fn forced_flush_on_exit() {
        let c = Counter::new(7);
        let t0 = Instant::now();
        c.increment(t0);
        let mut saved = 0;
        assert_eq!(
            c.flush(t0, true, |v| {
                saved = v;
                Ok::<(), ()>(())
            }),
            Ok(true)
        );
        assert_eq!(saved, 8);
    }

    #[test]
    fn throttle_limits_to_ten_per_second() {
        let mut th = Throttle::new(ms(100));
        let t0 = Instant::now();
        let allowed = (0..100).filter(|i| th.allow(t0 + ms(i * 10))).count();
        assert_eq!(allowed, 10);
    }
}
