use serde_json::Value;

#[derive(Debug)]
pub(super) struct ParsedAgentEvent {
    pub event_type: String,
    pub role: Option<String>,
    pub title: Option<String>,
    pub body: String,
    pub status: Option<String>,
    pub metadata: Option<Value>,
}

pub(super) fn parse_adapter_line(provider: &str, line: &str) -> Vec<ParsedAgentEvent> {
    let value = match serde_json::from_str::<Value>(line) {
        Ok(value) => value,
        Err(_) => {
            let text = strip_ansi(line).trim().to_string();
            if text.is_empty() {
                return Vec::new();
            }
            return vec![ParsedAgentEvent {
                event_type: "assistant_message".to_string(),
                role: Some("assistant".to_string()),
                title: None,
                body: text,
                status: None,
                metadata: None,
            }];
        }
    };
    match provider {
        "claude_code" => parse_claude_json_line(&value),
        "codex" => parse_codex_json_line(&value),
        "kimi_code" => parse_kimi_json_line(&value),
        "local_llm" => parse_local_llm_line(line),
        _ => Vec::new(),
    }
}

fn parse_local_llm_line(line: &str) -> Vec<ParsedAgentEvent> {
    let text = strip_ansi(line).trim().to_string();
    if text.is_empty() {
        return Vec::new();
    }

    // Basic heuristic for local LLMs: if it looks like a tool call in markdown or specific text
    // we can try to promote it, but for now we just treat it as assistant text.
    // The UI handles markdown rendering of the 'body' automatically.
    vec![ParsedAgentEvent {
        event_type: "assistant_message".to_string(),
        role: Some("assistant".to_string()),
        title: None,
        body: text,
        status: None,
        metadata: None,
    }]
}

fn parse_claude_json_line(value: &Value) -> Vec<ParsedAgentEvent> {
    let mut out = Vec::new();
    let event_type = value.get("type").and_then(Value::as_str).unwrap_or("");
    if event_type == "stream_event" {
        return parse_claude_stream_event(value.get("event").unwrap_or(value));
    }
    if event_type == "result" {
        return out;
    }
    let message = value.get("message").unwrap_or(value);
    if let Some(content) = message.get("content").and_then(Value::as_array) {
        for item in content {
            match item.get("type").and_then(Value::as_str).unwrap_or("") {
                "text" => {
                    if let Some(text) = item
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|s| !s.trim().is_empty())
                    {
                        out.push(assistant_text(text));
                    }
                }
                "tool_use" => {
                    let name = item.get("name").and_then(Value::as_str).unwrap_or("Tool");
                    out.push(ParsedAgentEvent {
                        event_type: tool_event_type(name),
                        role: None,
                        title: Some(name.to_string()),
                        body: summarize_json(item.get("input"))
                            .unwrap_or_else(|| "Tool started.".to_string()),
                        status: Some("running".to_string()),
                        metadata: Some(item.clone()),
                    });
                }
                "tool_result" => {
                    out.push(ParsedAgentEvent {
                        event_type: "tool_result".to_string(),
                        role: None,
                        title: Some("Tool result".to_string()),
                        body: item
                            .get("content")
                            .and_then(Value::as_str)
                            .unwrap_or("Tool completed.")
                            .to_string(),
                        status: Some("done".to_string()),
                        metadata: Some(item.clone()),
                    });
                }
                _ => {}
            }
        }
    }
    out
}

fn parse_claude_stream_event(value: &Value) -> Vec<ParsedAgentEvent> {
    match value.get("type").and_then(Value::as_str).unwrap_or("") {
        "content_block_start" => {
            let block_type = value
                .get("content_block")
                .and_then(|block| block.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if block_type == "thinking" {
                vec![ParsedAgentEvent {
                    event_type: "thinking".to_string(),
                    role: None,
                    title: Some("Thinking".to_string()),
                    body: "Claude is thinking…".to_string(),
                    status: Some("running".to_string()),
                    metadata: None,
                }]
            } else {
                Vec::new()
            }
        }
        "content_block_delta" => {
            let delta = value.get("delta").unwrap_or(value);
            if delta.get("text").and_then(Value::as_str).is_some() {
                return Vec::new();
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn parse_codex_json_line(value: &Value) -> Vec<ParsedAgentEvent> {
    let mut out = Vec::new();
    let typ = value
        .get("type")
        .or_else(|| value.get("event"))
        .and_then(Value::as_str)
        .unwrap_or("");

    if let Some(item) = value.get("item") {
        let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
        if item_type == "agent_message" {
            if let Some(text) = item
                .get("text")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
            {
                out.push(assistant_text(text));
            }
            return out;
        }
    }

    if let Some(text) = value
        .get("message")
        .or_else(|| value.get("text"))
        .or_else(|| value.get("content"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        out.push(assistant_text(text));
    } else if typ.contains("command") || typ.contains("exec") || typ.contains("tool") {
        out.push(ParsedAgentEvent {
            event_type: if typ.contains("command") || typ.contains("exec") {
                "command"
            } else {
                "tool_call"
            }
            .to_string(),
            role: None,
            title: Some(if typ.is_empty() {
                "Codex event".to_string()
            } else {
                typ.to_string()
            }),
            body: summarize_json(Some(value)).unwrap_or_else(|| "Codex event.".to_string()),
            status: None,
            metadata: Some(value.clone()),
        });
    }
    out
}

fn parse_kimi_json_line(value: &Value) -> Vec<ParsedAgentEvent> {
    let mut out = Vec::new();
    let role = value.get("role").and_then(Value::as_str).unwrap_or("");

    if role == "assistant" {
        if let Some(text) = value
            .get("content")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
        {
            out.push(assistant_text(text));
        }
        if let Some(tool_calls) = value.get("tool_calls").and_then(Value::as_array) {
            for call in tool_calls {
                let name = call
                    .get("function")
                    .and_then(|v| v.get("name"))
                    .and_then(Value::as_str)
                    .or_else(|| call.get("name").and_then(Value::as_str))
                    .unwrap_or("Tool");
                out.push(ParsedAgentEvent {
                    event_type: tool_event_type(name),
                    role: None,
                    title: Some(name.to_string()),
                    body: call
                        .get("function")
                        .and_then(|v| v.get("arguments"))
                        .and_then(Value::as_str)
                        .unwrap_or("Tool started.")
                        .to_string(),
                    status: Some("running".to_string()),
                    metadata: Some(call.clone()),
                });
            }
        }
        return out;
    }

    if role == "tool" {
        out.push(ParsedAgentEvent {
            event_type: "tool_result".to_string(),
            role: None,
            title: Some("Tool result".to_string()),
            body: value
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("Tool completed.")
                .to_string(),
            status: Some("done".to_string()),
            metadata: Some(value.clone()),
        });
        return out;
    }

    if let Some(text) = value
        .get("message")
        .or_else(|| value.get("content"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        out.push(assistant_text(text));
        return out;
    }

    if !value.is_null() {
        out.push(ParsedAgentEvent {
            event_type: "diagnostic".to_string(),
            role: None,
            title: Some("Kimi event".to_string()),
            body: summarize_json(Some(value)).unwrap_or_else(|| "Kimi event.".to_string()),
            status: None,
            metadata: Some(value.clone()),
        });
    }
    out
}

fn assistant_text(text: &str) -> ParsedAgentEvent {
    ParsedAgentEvent {
        event_type: "assistant_message".to_string(),
        role: Some("assistant".to_string()),
        title: None,
        body: text.to_string(),
        status: None,
        metadata: None,
    }
}

fn tool_event_type(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("bash") || lower.contains("shell") || lower.contains("command") {
        "command".to_string()
    } else if lower.contains("test") {
        "test_run".to_string()
    } else if lower.contains("todo") {
        "todo".to_string()
    } else if lower.contains("read")
        || lower.contains("view")
        || lower.contains("grep")
        || lower.contains("glob")
    {
        "file_read".to_string()
    } else if lower.contains("edit")
        || lower.contains("write")
        || lower.contains("file")
        || lower.contains("notebook")
    {
        "file_change".to_string()
    } else {
        "tool_call".to_string()
    }
}

fn summarize_json(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(command) = value.get("command").and_then(Value::as_str) {
        return Some(command.to_string());
    }
    if let Some(path) = value
        .get("file_path")
        .or_else(|| value.get("path"))
        .and_then(Value::as_str)
    {
        return Some(path.to_string());
    }
    serde_json::to_string_pretty(value)
        .ok()
        .map(|raw| raw.chars().take(1200).collect())
}

fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(ch);
        }
    }
    out
}
