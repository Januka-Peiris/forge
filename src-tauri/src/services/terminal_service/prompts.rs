use crate::models::TerminalSession;

pub(super) fn terminal_prompt_payload_for_session(session: &TerminalSession, prompt: &str) -> String {
    if is_ollama_terminal_session(session) && prompt.contains('\n') {
        return format!(
            "\"\"\"\n{}\n\"\"\"\r\n",
            escape_ollama_multiline_prompt(prompt)
        );
    }
    format!("{prompt}\r\n")
}

fn is_ollama_terminal_session(session: &TerminalSession) -> bool {
    let command = session.command.to_ascii_lowercase();
    command.ends_with("/ollama") || command == "ollama" || command.contains("ollama")
}

fn escape_ollama_multiline_prompt(prompt: &str) -> String {
    prompt.replace("\"\"\"", "\\\"\\\"\\\"")
}
