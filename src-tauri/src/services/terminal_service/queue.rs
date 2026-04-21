use std::io::Write;
use std::sync::atomic::AtomicU64;

use crate::models::{AgentPromptEntry, QueueAgentPromptInput};
use crate::repositories::terminal_repository;
use crate::services::{
    agent_context_service, agent_profile_service, checkpoint_service, terminal_service,
};
use crate::state::AppState;

use super::output::{append_output, unique_suffix};
use super::prompts::terminal_prompt_payload_for_session;
use super::runtime::{active_for_workspace, ensure_agent_session_for_prompt};

pub(super) fn queue_workspace_agent_prompt(
    state: &AppState,
    input: QueueAgentPromptInput,
) -> Result<AgentPromptEntry, String> {
    let mut prompt = input.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Prompt is required".to_string());
    }
    if let Ok(context) = agent_context_service::get_workspace_agent_context(state, &input.workspace_id)
    {
        if !context.prompt_preamble.trim().is_empty()
            && !prompt.contains("Forge linked repository context:")
        {
            prompt = format!("{}\n\nUser request:\n{}", context.prompt_preamble, prompt);
        }
    }

    let context_enabled =
        crate::repositories::settings_repository::get_value(&state.db, "context_enabled")
            .unwrap_or_default()
            .map(|value| value != "false")
            .unwrap_or(true);

    if context_enabled {
        let is_first_prompt = {
            let active_session =
                terminal_repository::get_active_session_id_for_workspace(&state.db, &input.workspace_id)
                    .unwrap_or(None);
            match active_session {
                None => true,
                Some(session_id) => {
                    terminal_repository::count_sent_prompts_for_session(&state.db, &session_id)
                        .unwrap_or(1)
                        == 0
                }
            }
        };

        if is_first_prompt && !prompt.contains("[FORGE CONTEXT]") {
            if let Some(context_block) =
                agent_context_service::build_session_open_context(state, &input.workspace_id)
            {
                prompt = format!("{}\n\nUser request:\n{}", context_block, prompt);
            }
        }
    }

    let resolved_profile = agent_profile_service::resolve_agent_profile(
        state,
        Some(&input.workspace_id),
        input.profile_id.as_deref(),
        input.profile.as_deref(),
    )?;
    if resolved_profile.agent == "local_llm" || resolved_profile.local {
        let should_send_envelope = terminal_repository::get_active_session_id_for_workspace(
            &state.db,
            &input.workspace_id,
        )
        .ok()
        .flatten()
        .and_then(|session_id| {
            terminal_repository::count_sent_prompts_for_session(&state.db, &session_id).ok()
        })
        .map(|count| count == 0)
        .unwrap_or(true);
        if should_send_envelope {
            prompt = agent_profile_service::local_llm_prompt_envelope(
                &resolved_profile,
                input.task_mode.as_deref(),
                &prompt,
            );
        }
    } else {
        let metadata = agent_profile_service::prompt_metadata_preamble_for_workspace(
            state,
            Some(&input.workspace_id),
            &resolved_profile,
            input.task_mode.as_deref(),
            input.reasoning.as_deref(),
        );
        if !prompt.contains("Forge agent profile:") {
            prompt = format!("{metadata}\n\nUser request:\n{prompt}");
        }
    }
    let profile = resolved_profile.id.clone();
    let mut entry = AgentPromptEntry {
        id: format!("prompt-{}", unique_suffix()),
        workspace_id: input.workspace_id.clone(),
        session_id: None,
        profile,
        prompt,
        status: "queued".to_string(),
        created_at: terminal_service::timestamp(),
        sent_at: None,
    };
    terminal_repository::insert_prompt_entry(&state.db, &entry)?;

    let mode = input.mode.unwrap_or_else(|| "send_now".to_string());
    if mode == "send_now" {
        dispatch_prompt_entry(state, &mut entry)?;
    }
    Ok(entry)
}

pub(super) fn batch_dispatch_workspace_agent_prompt(
    state: &AppState,
    input: crate::models::BatchDispatchPromptInput,
) -> Result<Vec<AgentPromptEntry>, String> {
    if input.prompt.trim().is_empty() {
        return Err("Prompt is required".to_string());
    }
    let mut entries = Vec::with_capacity(input.workspace_ids.len());
    for workspace_id in &input.workspace_ids {
        let result = queue_workspace_agent_prompt(
            state,
            QueueAgentPromptInput {
                workspace_id: workspace_id.clone(),
                prompt: input.prompt.clone(),
                profile: None,
                profile_id: input.profile_id.clone(),
                task_mode: input.task_mode.clone(),
                reasoning: input.reasoning.clone(),
                mode: Some("send_now".to_string()),
            },
        );
        match result {
            Ok(entry) => entries.push(entry),
            Err(err) => log::warn!(
                target: "forge_lib",
                "batch_dispatch: failed for workspace {workspace_id}: {err}"
            ),
        }
    }
    Ok(entries)
}

pub(super) fn run_next_workspace_agent_prompt(
    state: &AppState,
    workspace_id: &str,
) -> Result<Option<AgentPromptEntry>, String> {
    let mut entry = match terminal_repository::latest_queued_prompt_for_workspace(
        &state.db,
        workspace_id,
    )? {
        Some(entry) => entry,
        None => return Ok(None),
    };
    dispatch_prompt_entry(state, &mut entry)?;
    Ok(Some(entry))
}

pub(super) fn list_workspace_agent_prompts(
    state: &AppState,
    workspace_id: &str,
    limit: Option<u32>,
) -> Result<Vec<AgentPromptEntry>, String> {
    terminal_repository::list_prompts_for_workspace(&state.db, workspace_id, limit)
}

fn dispatch_prompt_entry(state: &AppState, entry: &mut AgentPromptEntry) -> Result<(), String> {
    if let Err(err) =
        checkpoint_service::create_checkpoint_if_dirty(state, &entry.workspace_id, "before agent prompt")
    {
        log::warn!(
            target: "forge_lib",
            "failed to create pre-prompt checkpoint for workspace {}: {err}",
            entry.workspace_id
        );
    }

    let session = ensure_agent_session_for_prompt(state, &entry.workspace_id, &entry.profile)?;

    let active = active_for_workspace(state, &entry.workspace_id, "agent")?
        .ok_or_else(|| "No active agent session found to send prompt".to_string())?;
    let mut writer = active
        .writer
        .lock()
        .map_err(|_| "Terminal writer lock poisoned".to_string())?;
    writer
        .write_all(terminal_prompt_payload_for_session(&session, &entry.prompt).as_bytes())
        .map_err(|err| format!("Failed to write prompt to terminal: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush prompt to terminal: {err}"))?;

    let sent_at = terminal_service::timestamp();
    terminal_repository::mark_prompt_sent(&state.db, &entry.id, &session.id, &sent_at)?;
    entry.session_id = Some(session.id.clone());
    entry.status = "sent".to_string();
    entry.sent_at = Some(sent_at.clone());

    append_output(
        Some(&state.app_handle),
        &state.db,
        &entry.workspace_id,
        &session.id,
        &AtomicU64::new(terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0)),
        "system",
        &format!("\r\n[forge] queued prompt sent at {sent_at}\r\n"),
    );
    Ok(())
}
