use std::time::{Duration, Instant};

const SLOW_COMMAND_THRESHOLD: Duration = Duration::from_millis(250);

pub fn measure_command<T>(name: &str, f: impl FnOnce() -> T) -> T {
    let start = Instant::now();
    let result = f();
    let elapsed = start.elapsed();
    if elapsed >= SLOW_COMMAND_THRESHOLD {
        log::info!(
            target: "forge_lib",
            "slow tauri command: {name} took {}ms",
            elapsed.as_millis()
        );
    }
    result
}
