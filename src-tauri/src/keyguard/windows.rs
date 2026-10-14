//! Implémentation à venir.

use std::sync::Arc;

use super::{GuardStatus, KeyGuard, Shared};

struct Pending;

impl KeyGuard for Pending {
    fn status(&self) -> GuardStatus {
        GuardStatus::Unavailable {
            reason: "Blocage pas encore implémenté sur ce système.".into(),
        }
    }
}

pub fn start(_shared: Arc<Shared>) -> Box<dyn KeyGuard> {
    Box::new(Pending)
}
