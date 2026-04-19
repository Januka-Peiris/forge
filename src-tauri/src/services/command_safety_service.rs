/// Shell command patterns considered risky enough to require explicit approval or blocking.
const RISKY_COMMAND_PATTERNS: &[&str] = &[
    "rm -rf",
    "rm -fr",
    "rm -r ",
    "sudo rm",
    "git push --force",
    "git push -f",
    "git reset --hard",
    "git clean -f",
    "git clean -fd",
    "chmod -R 777",
    "dd if=",
    "mkfs",
    ": >",
    "DROP TABLE",
    "DROP DATABASE",
];

pub fn is_risky_command(command: &str) -> bool {
    let lower = command.to_lowercase();
    RISKY_COMMAND_PATTERNS.iter().any(|pattern| {
        // Case-insensitive for SQL keywords, case-sensitive for shell commands.
        if pattern
            .chars()
            .next()
            .map(|char| char.is_uppercase())
            .unwrap_or(false)
        {
            lower.contains(&pattern.to_lowercase())
        } else {
            command.contains(pattern)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_risky_shell_commands() {
        assert!(is_risky_command("rm -rf /tmp/example"));
        assert!(is_risky_command("git reset --hard HEAD"));
        assert!(is_risky_command("git push --force origin branch"));
        assert!(is_risky_command("psql -c 'DROP TABLE users'"));
    }

    #[test]
    fn allows_normal_dev_commands() {
        assert!(!is_risky_command("npm run test"));
        assert!(!is_risky_command("cargo test --workspace"));
    }
}
