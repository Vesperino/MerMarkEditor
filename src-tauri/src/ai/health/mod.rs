pub mod claude;
pub mod codex;

use crate::ai::types::{CliKind, HealthStatus};

pub async fn check(cli: CliKind) -> HealthStatus {
    match cli {
        CliKind::Claude => claude::probe().await,
        CliKind::Codex => codex::probe().await,
    }
}
