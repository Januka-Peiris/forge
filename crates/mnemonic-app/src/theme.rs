use gpui::Rgba;
use mnemonic_core::repositories::settings_repository;
use mnemonic_core::state::AppState;

const THEME_SETTINGS_KEY: &str = "gpui_theme";

#[derive(Clone, Debug)]
pub(crate) struct MnemonicTheme {
    pub name: &'static str,

    pub terminal_bg: u32,
    pub background: u32,
    pub tab_bar_bg: u32,
    pub sidebar_bg: u32,
    pub surface: u32,
    pub surface_selected: u32,
    pub surface_hover: u32,
    pub border: u32,

    pub text_primary: u32,
    pub text_secondary: u32,
    pub text_muted: u32,
    pub text_faint: u32,

    #[allow(dead_code)]
    pub accent: u32,
    pub success: u32,
    pub warning: u32,
    pub destructive: u32,

    pub terminal_fg: u32,
    pub terminal_selection: u32,
    pub terminal_cursor: u32,
    pub terminal_ansi: [u32; 16],
}

impl MnemonicTheme {
    pub fn midnight() -> Self {
        Self {
            name: "midnight",
            terminal_bg: 0x05070b,
            background: 0x0f1117,
            tab_bar_bg: 0x10131a,
            sidebar_bg: 0x151821,
            surface: 0x1b1f2a,
            surface_selected: 0x263249,
            surface_hover: 0x273043,
            border: 0x2a2f3a,

            text_primary: 0xf4f7fb,
            text_secondary: 0xa3adbc,
            text_muted: 0x8793a6,
            text_faint: 0x697386,

            accent: 0x5aa9ff,
            success: 0x73d13d,
            warning: 0xffd166,
            destructive: 0xff6b6b,

            terminal_fg: 0xd7dde8,
            terminal_selection: 0x244b7a,
            terminal_cursor: 0xd7dde8,
            terminal_ansi: [
                0x1b1f2a, // black
                0xff6b6b, // red
                0x73d13d, // green
                0xffd166, // yellow
                0x5aa9ff, // blue
                0xd987ff, // magenta
                0x5eead4, // cyan
                0xd7dde8, // white
                0x6b7280, // bright black
                0xff8a8a, // bright red
                0x9be564, // bright green
                0xffe08a, // bright yellow
                0x80c0ff, // bright blue
                0xe0a3ff, // bright magenta
                0x8ff5e8, // bright cyan
                0xffffff, // bright white
            ],
        }
    }

    pub fn coastal() -> Self {
        Self {
            name: "coastal",
            terminal_bg: 0x0a1628,
            background: 0x0d1b2a,
            tab_bar_bg: 0x112033,
            sidebar_bg: 0x152538,
            surface: 0x1b2d42,
            surface_selected: 0x264060,
            surface_hover: 0x1f3854,
            border: 0x2a4460,

            text_primary: 0xe8f0fa,
            text_secondary: 0x9cb4cc,
            text_muted: 0x7a95b0,
            text_faint: 0x5a7a94,

            accent: 0x5badff,
            success: 0x56d68c,
            warning: 0xf0c060,
            destructive: 0xff7070,

            terminal_fg: 0xd0dfe8,
            terminal_selection: 0x1e4a7a,
            terminal_cursor: 0xd0dfe8,
            terminal_ansi: [
                0x1b2d42, // black
                0xff7070, // red
                0x56d68c, // green
                0xf0c060, // yellow
                0x5badff, // blue
                0xc480ff, // magenta
                0x50d4c0, // cyan
                0xd0dfe8, // white
                0x5a7a94, // bright black
                0xff9494, // bright red
                0x80e8a8, // bright green
                0xf4d48c, // bright yellow
                0x88c8ff, // bright blue
                0xd8a8ff, // bright magenta
                0x80f0e0, // bright cyan
                0xffffff, // bright white
            ],
        }
    }

    pub fn by_name(name: &str) -> Self {
        match name {
            "coastal" => Self::coastal(),
            _ => Self::midnight(),
        }
    }

    pub fn all_names() -> &'static [&'static str] {
        &["midnight", "coastal"]
    }

    pub fn load(state: Option<&AppState>) -> Self {
        let name = state
            .and_then(|state| settings_repository::get_value(&state.db, THEME_SETTINGS_KEY).ok())
            .flatten()
            .unwrap_or_default();
        Self::by_name(&name)
    }

    pub fn persist(&self, state: Option<&AppState>) -> Result<(), String> {
        let Some(state) = state else {
            return Ok(());
        };
        settings_repository::set_value(&state.db, THEME_SETTINGS_KEY, self.name)
    }

    pub fn next(&self) -> Self {
        let names = Self::all_names();
        let current = names.iter().position(|n| *n == self.name).unwrap_or(0);
        let next = (current + 1) % names.len();
        Self::by_name(names[next])
    }

    pub fn terminal_bg_rgba(&self) -> Rgba {
        gpui::rgb(self.terminal_bg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn midnight_is_default() {
        let theme = MnemonicTheme::by_name("unknown");
        assert_eq!(theme.name, "midnight");
    }

    #[test]
    fn next_cycles_through_themes() {
        let midnight = MnemonicTheme::midnight();
        let next = midnight.next();
        assert_eq!(next.name, "coastal");
        let back = next.next();
        assert_eq!(back.name, "midnight");
    }

    #[test]
    fn ansi_palette_has_16_colors() {
        let midnight = MnemonicTheme::midnight();
        assert_eq!(midnight.terminal_ansi.len(), 16);
        let coastal = MnemonicTheme::coastal();
        assert_eq!(coastal.terminal_ansi.len(), 16);
    }
}
