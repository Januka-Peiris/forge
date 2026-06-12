use gpui::{div, prelude::*, rgb, Context, InteractiveElement, IntoElement, ParentElement, Styled};
use mnemonic_core::repositories::settings_repository;
use mnemonic_core::state::AppState;

use crate::display_settings::TerminalDisplaySettings;
use crate::theme::MnemonicTheme;

pub(crate) struct SettingsState {
    pub claude_model: String,
    pub codex_model: String,
    pub orchestrator_model: String,
}

impl SettingsState {
    pub fn load(state: &AppState) -> Self {
        let claude_model = settings_repository::get_value(&state.db, "claude_agent_default_model")
            .ok()
            .flatten()
            .or_else(|| {
                settings_repository::get_value(&state.db, "agent_default_model")
                    .ok()
                    .flatten()
            })
            .unwrap_or_else(|| "claude-opus-4-6[1m]".to_string());
        let codex_model = settings_repository::get_value(&state.db, "codex_agent_default_model")
            .ok()
            .flatten()
            .unwrap_or_else(|| "gpt-5.4".to_string());
        let orchestrator_model =
            settings_repository::get_value(&state.db, "orchestrator_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "claude-opus-4-6".to_string());
        Self {
            claude_model,
            codex_model,
            orchestrator_model,
        }
    }
}

pub(crate) fn render_settings_panel(
    theme: &MnemonicTheme,
    display_settings: &TerminalDisplaySettings,
    settings: &SettingsState,
    cx: &mut Context<crate::app::MnemonicApp>,
) -> impl IntoElement {
    let text_primary = rgb(theme.text_primary);
    let text_secondary = rgb(theme.text_secondary);
    let text_muted = rgb(theme.text_muted);
    let surface = rgb(theme.surface);
    let surface_hover = rgb(theme.surface_hover);
    let background = rgb(theme.background);

    div()
        .flex_1()
        .h_full()
        .bg(background)
        .p_5()
        .flex()
        .flex_col()
        .gap_4()
        .overflow_hidden()
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_color(text_primary)
                        .text_2xl()
                        .font_weight(gpui::FontWeight::SEMIBOLD)
                        .child("Settings"),
                )
                .child(
                    div()
                        .id("close-settings")
                        .rounded_md()
                        .px_3()
                        .py_1()
                        .bg(surface)
                        .hover(|s| s.bg(surface_hover))
                        .text_color(text_secondary)
                        .text_sm()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.settings_open = false;
                            cx.notify();
                        }))
                        .child("Close"),
                ),
        )
        .child(settings_section(
            "Theme",
            theme,
            div()
                .flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .text_color(text_secondary)
                        .text_sm()
                        .child(format!("Current: {}", theme.name)),
                )
                .child(
                    div()
                        .id("settings-cycle-theme")
                        .rounded_md()
                        .px_3()
                        .py_1()
                        .bg(surface)
                        .hover(|s| s.bg(surface_hover))
                        .text_color(text_primary)
                        .text_xs()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.cycle_theme(cx);
                        }))
                        .child("Switch Theme"),
                ),
        ))
        .child(settings_section(
            "Terminal Font",
            theme,
            div()
                .flex()
                .flex_col()
                .gap_1()
                .child(
                    div()
                        .text_color(text_secondary)
                        .text_sm()
                        .child(format!(
                            "Family: {}",
                            display_settings.font_family
                        )),
                )
                .child(
                    div()
                        .text_color(text_secondary)
                        .text_sm()
                        .child(format!("Size: {:.0}px", display_settings.font_size)),
                )
                .child(
                    div()
                        .text_color(text_muted)
                        .text_xs()
                        .child("Use Cmd+=/Cmd+- to adjust font size"),
                ),
        ))
        .child(settings_section(
            "AI Models",
            theme,
            div()
                .flex()
                .flex_col()
                .gap_2()
                .child(model_row(
                    "Claude Agent",
                    &settings.claude_model,
                    text_secondary,
                    text_muted,
                ))
                .child(model_row(
                    "Codex Agent",
                    &settings.codex_model,
                    text_secondary,
                    text_muted,
                ))
                .child(model_row(
                    "Orchestrator",
                    &settings.orchestrator_model,
                    text_secondary,
                    text_muted,
                )),
        ))
        .child(settings_section(
            "Database",
            theme,
            div()
                .text_color(text_muted)
                .text_xs()
                .child("Model settings are stored in the Mnemonic SQLite database and shared with the Tauri v2 frontend."),
        ))
}

fn settings_section(
    title: &str,
    theme: &MnemonicTheme,
    content: impl IntoElement,
) -> impl IntoElement {
    div()
        .rounded_lg()
        .border_1()
        .border_color(rgb(theme.border))
        .bg(rgb(theme.sidebar_bg))
        .p_4()
        .flex()
        .flex_col()
        .gap_2()
        .child(
            div()
                .text_color(rgb(theme.text_primary))
                .text_sm()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .child(title.to_string()),
        )
        .child(content)
}

fn model_row(
    label: &str,
    value: &str,
    label_color: gpui::Rgba,
    value_color: gpui::Rgba,
) -> impl IntoElement {
    div()
        .flex()
        .items_center()
        .justify_between()
        .child(
            div()
                .text_color(label_color)
                .text_sm()
                .child(label.to_string()),
        )
        .child(
            div()
                .text_color(value_color)
                .text_xs()
                .child(if value.is_empty() {
                    "(not set)".to_string()
                } else {
                    value.to_string()
                }),
        )
}
