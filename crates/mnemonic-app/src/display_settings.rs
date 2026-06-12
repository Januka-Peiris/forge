use mnemonic_core::repositories::settings_repository;
use mnemonic_core::state::AppState;

const TERMINAL_DISPLAY_SETTINGS_KEY: &str = "gpui_terminal_display_settings";
const DEFAULT_FONT_FAMILY: &str = "Menlo";
const DEFAULT_FONT_SIZE: f32 = 13.0;
const MIN_FONT_SIZE: f32 = 9.0;
const MAX_FONT_SIZE: f32 = 28.0;
const CELL_WIDTH_RATIO: f32 = 9.0 / 13.0;
const LINE_HEIGHT_RATIO: f32 = 18.0 / 13.0;

#[derive(Clone, Debug)]
pub(crate) struct TerminalDisplaySettings {
    pub font_family: String,
    pub font_size: f32,
    pub cell_width: f32,
    pub line_height: f32,
}

impl Default for TerminalDisplaySettings {
    fn default() -> Self {
        Self::from_font_size(DEFAULT_FONT_SIZE)
    }
}

impl TerminalDisplaySettings {
    pub fn load(state: Option<&AppState>) -> Self {
        let Some(state) = state else {
            return Self::default();
        };
        let Ok(Some(raw)) =
            settings_repository::get_value(&state.db, TERMINAL_DISPLAY_SETTINGS_KEY)
        else {
            return Self::default();
        };
        Self::from_json(&raw).unwrap_or_default()
    }

    pub fn persist(&self, state: Option<&AppState>) -> Result<(), String> {
        let Some(state) = state else {
            return Ok(());
        };
        settings_repository::set_value(&state.db, TERMINAL_DISPLAY_SETTINGS_KEY, &self.to_json())
    }

    pub fn zoom_by(&mut self, delta: f32) {
        *self = Self::from_font_family_and_size(&self.font_family, self.font_size + delta);
    }

    pub fn reset_zoom(&mut self) {
        *self = Self::default();
    }

    fn from_font_size(font_size: f32) -> Self {
        Self::from_font_family_and_size(DEFAULT_FONT_FAMILY, font_size)
    }

    fn from_font_family_and_size(font_family: &str, font_size: f32) -> Self {
        let font_size = clamp_font_size(font_size);
        Self {
            font_family: sanitize_font_family(font_family),
            font_size,
            cell_width: font_size * CELL_WIDTH_RATIO,
            line_height: font_size * LINE_HEIGHT_RATIO,
        }
    }

    fn from_json(raw: &str) -> Option<Self> {
        let value: serde_json::Value = serde_json::from_str(raw).ok()?;
        let font_family = value
            .get("font_family")
            .and_then(|value| value.as_str())
            .unwrap_or(DEFAULT_FONT_FAMILY);
        let font_size = value
            .get("font_size")
            .and_then(|value| value.as_f64())
            .map(|value| value as f32)
            .unwrap_or(DEFAULT_FONT_SIZE);
        Some(Self::from_font_family_and_size(font_family, font_size))
    }

    fn to_json(&self) -> String {
        serde_json::json!({
            "font_family": self.font_family,
            "font_size": self.font_size,
        })
        .to_string()
    }
}

fn clamp_font_size(font_size: f32) -> f32 {
    if !font_size.is_finite() {
        return DEFAULT_FONT_SIZE;
    }
    font_size.clamp(MIN_FONT_SIZE, MAX_FONT_SIZE)
}

fn sanitize_font_family(font_family: &str) -> String {
    let font_family = font_family.trim();
    if font_family.is_empty() {
        DEFAULT_FONT_FAMILY.to_string()
    } else {
        font_family.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_clamps_terminal_display_settings() {
        let settings = TerminalDisplaySettings::from_json(
            r#"{"font_family":" JetBrains Mono ","font_size":99}"#,
        )
        .expect("settings");

        assert_eq!(settings.font_family, "JetBrains Mono");
        assert_eq!(settings.font_size, MAX_FONT_SIZE);
        assert_eq!(settings.cell_width, MAX_FONT_SIZE * CELL_WIDTH_RATIO);
        assert_eq!(settings.line_height, MAX_FONT_SIZE * LINE_HEIGHT_RATIO);
    }

    #[test]
    fn malformed_terminal_display_settings_fall_back_to_default() {
        let settings = TerminalDisplaySettings::from_json("{}").expect("settings");

        assert_eq!(settings.font_family, DEFAULT_FONT_FAMILY);
        assert_eq!(settings.font_size, DEFAULT_FONT_SIZE);
    }
}
