/// Parse agent cost and token usage from terminal output.
///
/// Claude Code and Codex both emit lines like:
///   Total cost: $0.0234
///   Cost: $1.23 (1,234 input + 567 output tokens)
///   Tokens: 1,234
///
/// We strip ANSI escape codes first, then scan each line for these patterns.
/// Returns `Some((token_count, "$X.XX"))` if a cost line is found, `None` otherwise.
pub fn parse_cost(raw: &str) -> Option<(u32, String)> {
    let clean = strip_ansi(raw);
    for line in clean.lines() {
        let lower = line.to_lowercase();
        if !lower.contains("cost") {
            continue;
        }
        if let Some(dollar_pos) = line.find('$') {
            let digits: String = line[dollar_pos + 1..]
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            if digits.is_empty() {
                continue;
            }
            // Validate it looks like a dollar amount (has a decimal point).
            if !digits.contains('.') {
                continue;
            }
            let cost = format!("${digits}");
            let tokens = parse_token_count(&lower).unwrap_or(0);
            return Some((tokens, cost));
        }
    }
    None
}

/// Strip ANSI/VT100 escape sequences from a string.
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    chars.next(); // consume '['
                                  // CSI sequence: consume until a letter (the final byte).
                    for nc in chars.by_ref() {
                        if nc.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next(); // consume ']'
                                  // OSC sequence: consume until BEL (0x07) or ESC.
                    for nc in chars.by_ref() {
                        if nc == '\x07' || nc == '\x1b' {
                            break;
                        }
                    }
                }
                _ => {
                    // Other two-character escape: skip next char.
                    chars.next();
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Try to find a token count in a line like "1,234 tokens" or "tokens: 1,234".
fn parse_token_count(line: &str) -> Option<u32> {
    // Find the word "token" and look for digits near it.
    let token_pos = line.find("token")?;

    // Look backwards from "token" for a number.
    let before = &line[..token_pos];
    let digits: String = before
        .chars()
        .rev()
        .skip_while(|c| c.is_whitespace())
        .take_while(|c| c.is_ascii_digit() || *c == ',')
        .collect::<String>()
        .chars()
        .rev()
        .collect();

    if !digits.is_empty() {
        let clean: String = digits.chars().filter(|c| c.is_ascii_digit()).collect();
        return clean.parse().ok();
    }

    // Also look forward from "token" for a number (e.g. "tokens: 1,234").
    let after = &line[token_pos..];
    let digits: String = after
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit() || *c == ',')
        .collect();

    if !digits.is_empty() {
        let clean: String = digits.chars().filter(|c| c.is_ascii_digit()).collect();
        return clean.parse().ok();
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_claude_code_cost_line() {
        let output = "Total cost: $0.0234\r\n";
        let result = parse_cost(output);
        assert_eq!(result, Some((0, "$0.0234".to_string())));
    }

    #[test]
    fn parses_cost_with_tokens() {
        let output = "Cost: $1.23 (1,234 input tokens + 567 output tokens)\r\n";
        let result = parse_cost(output);
        assert!(result.is_some());
        let (tokens, cost) = result.unwrap();
        assert_eq!(cost, "$1.23");
        assert!(tokens > 0);
    }

    #[test]
    fn ignores_lines_without_cost() {
        let output = "Running tests...\r\nAll passed!\r\n";
        assert_eq!(parse_cost(output), None);
    }

    #[test]
    fn strips_ansi_before_parsing() {
        let output = "\x1b[1m\x1b[32mTotal cost:\x1b[0m \x1b[33m$0.15\x1b[0m\r\n";
        let result = parse_cost(output);
        assert_eq!(result, Some((0, "$0.15".to_string())));
    }

    #[test]
    fn ignores_cost_without_decimal() {
        // "$5" with no decimal should not be treated as a cost.
        let output = "Cost: $5\r\n";
        assert_eq!(parse_cost(output), None);
    }
}
