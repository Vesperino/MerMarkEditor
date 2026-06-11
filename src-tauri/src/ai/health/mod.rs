pub mod claude;
pub mod codex;
pub mod ollama;
pub mod openai;

use crate::ai::types::{CliKind, HealthStatus};

pub async fn check(cli: CliKind, override_path: Option<&str>) -> HealthStatus {
    match cli {
        CliKind::Claude => claude::probe(override_path).await,
        CliKind::Codex => codex::probe(override_path).await,
        CliKind::Ollama => ollama::probe(override_path).await,
        CliKind::Openai => openai::probe(override_path).await,
    }
}
