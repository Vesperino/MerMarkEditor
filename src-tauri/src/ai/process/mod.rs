pub mod registry;
pub mod normalizer;
pub mod claude;
pub mod codex;

pub use registry::ChildRegistry;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use uuid::Uuid;

use crate::ai::audit;
use crate::ai::types::{AccessMap, AiResponseChunk, AuditEntry, CliKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSendRequest {
    pub cli: CliKind,
    pub session_id: Option<String>,
    pub prompt: String,
    pub preamble: String,
    pub access_map: AccessMap,
    pub bypass: bool,
    pub work_dir: String,
}

pub async fn spawn(
    app: AppHandle,
    registry: tauri::State<'_, ChildRegistry>,
    req: AiSendRequest,
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();
    let child = match req.cli {
        CliKind::Claude => claude::spawn(&req)?,
        CliKind::Codex => codex::spawn(&req)?,
    };
    audit::append(&app, AuditEntry {
        ts: audit::now_iso(),
        session_id: req.session_id.clone(),
        cli: req.cli,
        action: "send".into(),
        args: serde_json::json!({ "request_id": request_id, "bypass": req.bypass }),
        result: serde_json::json!({}),
        exit_code: None,
    })?;
    spawn_pump(app, registry.inner(), request_id.clone(), req.cli, child);
    Ok(request_id)
}

fn spawn_pump(
    app: AppHandle,
    registry: &ChildRegistry,
    request_id: String,
    cli: CliKind,
    mut child: Child,
) {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    registry.insert(request_id.clone(), child);
    let event = format!("ai:stream:{}", request_id);
    let app_for_stdout = app.clone();
    let event_for_stdout = event.clone();
    let app_for_stderr = app;
    let event_for_stderr = event;
    if let Some(out) = stdout {
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(chunk) = normalizer::parse_line(cli, &line) {
                    let _ = app_for_stdout.emit(&event_for_stdout, chunk);
                }
            }
        });
    }
    if let Some(err) = stderr {
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_for_stderr.emit(
                    &event_for_stderr,
                    AiResponseChunk::Error { message: line, exit_code: None },
                );
            }
        });
    }
}

pub fn cancel(registry: &ChildRegistry, request_id: &str) {
    if let Some(mut child) = registry.take(request_id) {
        let _ = child.start_kill();
    }
}
