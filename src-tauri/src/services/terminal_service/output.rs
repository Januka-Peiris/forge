use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Emitter;

use crate::models::{TerminalOutputChunk, TerminalOutputEvent};
use crate::repositories::terminal_repository;
use crate::state::AppState;

const OUTPUT_RETENTION_CHUNKS: u32 = 2000;
const OUTPUT_PRUNE_INTERVAL: u64 = 500;

pub(super) fn append_output(
    app_handle: Option<&tauri::AppHandle>,
    db: &crate::db::Database,
    workspace_id: &str,
    session_id: &str,
    next_seq: &AtomicU64,
    stream_type: &str,
    data: &str,
) {
    let seq = next_seq.fetch_add(1, Ordering::SeqCst);
    let chunk = TerminalOutputChunk {
        id: format!("term-out-{}-{seq}", unique_suffix()),
        session_id: session_id.to_string(),
        seq,
        timestamp: timestamp(),
        stream_type: stream_type.to_string(),
        data: data.to_string(),
    };
    let _ = terminal_repository::insert_output_chunk(db, &chunk);
    if seq != 0 && seq.is_multiple_of(OUTPUT_PRUNE_INTERVAL) {
        let _ = terminal_repository::prune_output_chunks(db, session_id, OUTPUT_RETENTION_CHUNKS);
    }
    if let Some(app_handle) = app_handle {
        let _ = app_handle.emit(
            "forge://terminal-output",
            TerminalOutputEvent {
                workspace_id: workspace_id.to_string(),
                chunk,
            },
        );
    }
}

pub(super) fn append_log_line(
    state: &AppState,
    workspace_id: &str,
    session_id: &str,
    stream_type: &str,
    data: &str,
) {
    let next_seq = AtomicU64::new(terminal_repository::next_seq(&state.db, session_id).unwrap_or(0));
    append_output(
        Some(&state.app_handle),
        &state.db,
        workspace_id,
        session_id,
        &next_seq,
        stream_type,
        data,
    );
}

pub(super) fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub(super) fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos}")
}

pub(super) fn enriched_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_else(|_| String::from("/tmp"));
    let extras = [
        format!("{home}/.local/bin"),
        format!("{home}/.cargo/bin"),
        format!("{home}/.nvm/current/bin"),
        String::from("/opt/homebrew/bin"),
        String::from("/opt/homebrew/sbin"),
        String::from("/usr/local/bin"),
        String::from("/usr/bin"),
        String::from("/bin"),
        String::from("/usr/sbin"),
        String::from("/sbin"),
    ];
    let mut seen = HashSet::new();
    let mut parts = Vec::new();
    for entry in base.split(':').chain(extras.iter().map(|s| s.as_str())) {
        if !entry.is_empty() && seen.insert(entry.to_string()) {
            parts.push(entry.to_string());
        }
    }
    parts.join(":")
}
