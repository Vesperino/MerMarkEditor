pub mod claude;
pub mod codex;

use crate::ai::types::{CliKind, HealthStatus};

pub async fn check(cli: CliKind, override_path: Option<&str>) -> HealthStatus {
    match cli {
        CliKind::Claude => claude::probe(override_path).await,
        CliKind::Codex => codex::probe(override_path).await,
    }
}
