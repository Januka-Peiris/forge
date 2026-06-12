use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use gpui::{
    div, prelude::*, px, rgb, Context, Entity, FocusHandle, InteractiveElement, IntoElement,
    KeyDownEvent, ModifiersChangedEvent, ParentElement, Render, SharedString, Styled, Subscription,
    Window,
};
use mnemonic_core::models::WorkspaceSummary;
use mnemonic_core::repositories::settings_repository;
use mnemonic_core::services::workspace_service;
use mnemonic_core::state::AppState;
use terminal::terminal_settings::{AlternateScroll, CursorShape};
use terminal::{Event as TerminalEvent, Terminal, TerminalBuilder};
use util::paths::PathStyle;

use crate::core::{initialize_state, GPUI_SELECTED_WORKSPACE_KEY};
use crate::display_settings::TerminalDisplaySettings;
use crate::shell::{claude_shell, shell_for_login};
use crate::terminal_canvas::render_terminal_surface;
use crate::terminal_tab::{TerminalLaunch, TerminalScroll, TerminalTab};
use crate::{
    CloseTerminal, CopyTerminal, DecreaseTerminalFontSize, IncreaseTerminalFontSize,
    NewClaudeTerminal, NewTerminal, PasteTerminal, ResetTerminalFontSize, ScrollTerminalLineDown,
    ScrollTerminalLineUp, ScrollTerminalPageDown, ScrollTerminalPageUp, ScrollTerminalToBottom,
    ScrollTerminalToTop, SwitchTerminal1, SwitchTerminal2, SwitchTerminal3, SwitchTerminal4,
    SwitchTerminal5, SwitchTerminal6, SwitchTerminal7, SwitchTerminal8, SwitchTerminal9,
};

pub(crate) struct MnemonicApp {
    state: Option<AppState>,
    workspaces: Vec<WorkspaceSummary>,
    selected_workspace_id: Option<String>,
    status: SharedString,
    focus_handle: FocusHandle,
    terminal_tabs: Vec<TerminalTab>,
    active_tab: usize,
    terminal_subscriptions: Vec<Subscription>,
    pending_terminal_tasks: Vec<gpui::Task<()>>,
    next_terminal_id: u64,
    terminal_display_settings: TerminalDisplaySettings,
    self_test: Option<SelfTestState>,
}

struct SelfTestState {
    sentinel: String,
    cwd_failure: String,
    sentinel_prefix: String,
    sentinel_suffix: String,
    cwd_failure_prefix: String,
    cwd_failure_suffix: String,
    started_at: Instant,
    timeout: Duration,
    command_sent: bool,
}

impl MnemonicApp {
    pub(crate) fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);
        match initialize_state() {
            Ok(state) => {
                let workspaces = match workspace_service::list_workspaces(&state) {
                    Ok(workspaces) => workspaces,
                    Err(err) => {
                        log::warn!(target: "mnemonic_app", "failed to list workspaces: {err}");
                        Vec::new()
                    }
                };
                let persisted_workspace_id =
                    settings_repository::get_value(&state.db, GPUI_SELECTED_WORKSPACE_KEY)
                        .ok()
                        .flatten();
                let selected_workspace_id = persisted_workspace_id
                    .filter(|id| workspaces.iter().any(|workspace| workspace.id == *id))
                    .or_else(|| workspaces.first().map(|workspace| workspace.id.clone()));
                let status = format!(
                    "Loaded {} workspace(s) from {}",
                    workspaces.len(),
                    state.db.path().display()
                )
                .into();
                let terminal_display_settings = TerminalDisplaySettings::load(Some(&state));
                let mut app = Self {
                    state: Some(state),
                    workspaces,
                    selected_workspace_id,
                    status,
                    focus_handle,
                    terminal_tabs: Vec::new(),
                    active_tab: 0,
                    terminal_subscriptions: Vec::new(),
                    pending_terminal_tasks: Vec::new(),
                    next_terminal_id: 1,
                    terminal_display_settings,
                    self_test: Self::self_test_from_env(),
                };
                app.ensure_terminal_for_selection(cx);
                app
            }
            Err(err) => Self {
                state: None,
                workspaces: Vec::new(),
                selected_workspace_id: None,
                status: format!("Failed to initialize Mnemonic core: {err}").into(),
                focus_handle,
                terminal_tabs: Vec::new(),
                active_tab: 0,
                terminal_subscriptions: Vec::new(),
                pending_terminal_tasks: Vec::new(),
                next_terminal_id: 1,
                terminal_display_settings: TerminalDisplaySettings::default(),
                self_test: Self::self_test_from_env(),
            },
        }
    }

    fn selected_workspace(&self) -> Option<&WorkspaceSummary> {
        self.selected_workspace_id
            .as_ref()
            .and_then(|id| self.workspaces.iter().find(|workspace| &workspace.id == id))
    }

    fn selected_workspace_cwd(&self) -> Option<PathBuf> {
        self.selected_workspace().map(|workspace| {
            workspace
                .workspace_root_path
                .clone()
                .or_else(|| workspace.selected_worktree_path.clone())
                .or_else(|| workspace.repository_path.clone())
                .map(PathBuf::from)
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")))
        })
    }

    fn ensure_terminal_for_selection(&mut self, cx: &mut Context<Self>) {
        let Some(workspace_id) = self.selected_workspace_id.clone() else {
            return;
        };
        if let Some(index) = self
            .terminal_tabs
            .iter()
            .position(|tab| tab.workspace_id == workspace_id)
        {
            self.active_tab = index;
            return;
        }

        self.spawn_terminal_for_selection(TerminalLaunch::Shell, cx);
    }

    fn spawn_terminal_for_selection(&mut self, launch: TerminalLaunch, cx: &mut Context<Self>) {
        let Some(workspace_id) = self.selected_workspace_id.clone() else {
            self.status = "Select a workspace before opening a terminal".into();
            return;
        };
        let cwd = self
            .selected_workspace_cwd()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));
        let workspace_title = self
            .selected_workspace()
            .map(|workspace| workspace.name.clone())
            .unwrap_or_else(|| "Workspace".to_string());
        let terminal_id = self.next_terminal_id;
        self.next_terminal_id += 1;
        let (title, shell_result) = match launch {
            TerminalLaunch::Shell => (format!("{workspace_title} · shell"), Ok(shell_for_login())),
            TerminalLaunch::Claude => (
                format!("{workspace_title} · Claude"),
                claude_shell(self.state.as_ref(), &workspace_id),
            ),
        };
        let tab_id = format!("{workspace_id}:{terminal_id}");
        self.terminal_tabs.push(TerminalTab {
            id: tab_id.clone(),
            workspace_id: workspace_id.clone(),
            title,
            cwd: cwd.clone(),
            terminal: None,
            status: "Starting terminal…".into(),
        });
        self.active_tab = self.terminal_tabs.len().saturating_sub(1);

        let shell = match shell_result {
            Ok(shell) => shell,
            Err(err) => {
                if let Some(tab) = self.terminal_tabs.iter_mut().find(|tab| tab.id == tab_id) {
                    tab.status = format!("Terminal failed: {err}").into();
                }
                cx.notify();
                return;
            }
        };
        let builder_task = TerminalBuilder::new(
            Some(cwd.clone()),
            None,
            shell,
            HashMap::default(),
            CursorShape::default(),
            AlternateScroll::On,
            None,
            vec![],
            0,
            false,
            cx.entity_id().as_u64(),
            None,
            cx,
            vec![],
            PathStyle::local(),
        );

        let task = cx.spawn(async move |this, cx| match builder_task.await {
            Ok(builder) => {
                let _ = this.update(cx, |this, cx| {
                    let terminal = cx.new(|cx| builder.subscribe(cx));
                    let terminal_observer = cx.observe(&terminal, |_, _, cx| cx.notify());
                    let event_tab_id = tab_id.clone();
                    let terminal_events = cx.subscribe(
                        &terminal,
                        move |this, terminal, event: &TerminalEvent, cx| {
                            this.handle_terminal_event(&event_tab_id, terminal, event, cx);
                        },
                    );
                    if let Some(tab) = this.terminal_tabs.iter_mut().find(|tab| tab.id == tab_id) {
                        tab.status = "Running".into();
                        tab.terminal = Some(terminal);
                    }
                    this.terminal_subscriptions.push(terminal_observer);
                    this.terminal_subscriptions.push(terminal_events);
                    cx.notify();
                });
            }
            Err(err) => {
                let _ = this.update(cx, |this, cx| {
                    if let Some(tab) = this.terminal_tabs.iter_mut().find(|tab| tab.id == tab_id) {
                        tab.status = format!("Terminal failed: {err:#}").into();
                    }
                    cx.notify();
                });
            }
        });
        self.pending_terminal_tasks.push(task);
    }

    fn self_test_from_env() -> Option<SelfTestState> {
        if std::env::var("MNEMONIC_GPUI_SELF_TEST").as_deref() != Ok("1") {
            return None;
        }

        let timeout = std::env::var("MNEMONIC_GPUI_SELF_TEST_TIMEOUT_SECS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|seconds| *seconds > 0)
            .map(Duration::from_secs)
            .unwrap_or_else(|| Duration::from_secs(20));
        let self_test_id = std::process::id().to_string();
        let sentinel_prefix = "__MNEMONIC_GPUI_SELF_TEST_OK_".to_string();
        let sentinel_suffix = format!("{self_test_id}__");
        let cwd_failure_prefix = "__MNEMONIC_GPUI_SELF_TEST_CWD_FAIL_".to_string();
        let cwd_failure_suffix = format!("{self_test_id}__");
        let sentinel = format!("{sentinel_prefix}{sentinel_suffix}");
        let cwd_failure = format!("{cwd_failure_prefix}{cwd_failure_suffix}");
        eprintln!("MNEMONIC_GPUI_SELF_TEST starting; sentinel={sentinel}");
        Some(SelfTestState {
            sentinel,
            cwd_failure,
            sentinel_prefix,
            sentinel_suffix,
            cwd_failure_prefix,
            cwd_failure_suffix,
            started_at: Instant::now(),
            timeout,
            command_sent: false,
        })
    }

    fn poll_self_test(&mut self, cx: &mut Context<Self>) {
        if self.self_test.is_none() {
            return;
        }

        let terminal_and_cwd = self.terminal_tabs.get(self.active_tab).and_then(|tab| {
            let terminal = tab.terminal.clone()?;
            let expected_cwd = tab
                .cwd
                .canonicalize()
                .unwrap_or_else(|_| tab.cwd.clone())
                .to_string_lossy()
                .to_string();
            Some((terminal, expected_cwd))
        });

        let Some(test) = self.self_test.as_mut() else {
            return;
        };

        if test.started_at.elapsed() >= test.timeout {
            eprintln!(
                "MNEMONIC_GPUI_SELF_TEST timed out after {}s; command_sent={}",
                test.timeout.as_secs(),
                test.command_sent
            );
            std::process::exit(1);
        }

        let Some((terminal, expected_cwd)) = terminal_and_cwd else {
            return;
        };

        let content = terminal.update(cx, |terminal, cx| {
            if !test.command_sent {
                let command = format!(
                    "actual_cwd=$(pwd -P); ok_a={}; ok_b={}; fail_a={}; fail_b={}; expected={}; if [ \"$actual_cwd\" = \"$expected\" ]; then printf '%s%s\\n' \"$ok_a\" \"$ok_b\"; else printf '%s%s:expected=%s actual=%s\\n' \"$fail_a\" \"$fail_b\" \"$expected\" \"$actual_cwd\"; fi\n",
                    shell_single_quote(&test.sentinel_prefix),
                    shell_single_quote(&test.sentinel_suffix),
                    shell_single_quote(&test.cwd_failure_prefix),
                    shell_single_quote(&test.cwd_failure_suffix),
                    shell_single_quote(&expected_cwd),
                );
                terminal.paste(&command);
                test.command_sent = true;
                cx.notify();
            }
            terminal.get_content()
        });

        if content.contains(&test.cwd_failure) {
            eprintln!(
                "MNEMONIC_GPUI_SELF_TEST failed: shell cwd did not match selected workspace cwd"
            );
            eprintln!(
                "MNEMONIC_GPUI_SELF_TEST terminal content tail: {}",
                terminal_content_tail(&content)
            );
            std::process::exit(1);
        }
        if content.contains(&test.sentinel) {
            eprintln!(
                "MNEMONIC_GPUI_SELF_TEST passed; terminal command ran in selected workspace cwd"
            );
            std::process::exit(0);
        }
    }

    fn close_active_terminal(&mut self, cx: &mut Context<Self>) {
        if self.terminal_tabs.is_empty() {
            return;
        }
        self.remove_terminal_tab(self.active_tab);
        cx.notify();
    }

    fn remove_terminal_tab(&mut self, index: usize) {
        if index >= self.terminal_tabs.len() {
            return;
        }

        self.terminal_tabs.remove(index);
        if self.terminal_tabs.is_empty() {
            self.active_tab = 0;
        } else if index < self.active_tab {
            self.active_tab -= 1;
        } else {
            self.active_tab = self
                .active_tab
                .min(self.terminal_tabs.len().saturating_sub(1));
        }
    }

    fn switch_terminal(&mut self, index: usize, cx: &mut Context<Self>) {
        if index < self.terminal_tabs.len() {
            self.active_tab = index;
            cx.notify();
        }
    }

    fn active_terminal(&self) -> Option<Entity<Terminal>> {
        self.terminal_tabs
            .get(self.active_tab)
            .and_then(|tab| tab.terminal.clone())
    }

    fn active_tab_title(&self) -> Option<&str> {
        self.terminal_tabs
            .get(self.active_tab)
            .map(|tab| tab.title.as_str())
    }

    fn window_title(&self) -> String {
        match (self.selected_workspace(), self.active_tab_title()) {
            (Some(workspace), Some(tab_title)) => {
                format!("Mnemonic v3 — {} — {tab_title}", workspace.name)
            }
            (Some(workspace), None) => format!("Mnemonic v3 — {}", workspace.name),
            (None, Some(tab_title)) => format!("Mnemonic v3 — {tab_title}"),
            (None, None) => "Mnemonic v3".to_string(),
        }
    }

    fn handle_terminal_event(
        &mut self,
        tab_id: &str,
        terminal: Entity<Terminal>,
        event: &TerminalEvent,
        cx: &mut Context<Self>,
    ) {
        match event {
            TerminalEvent::TitleChanged | TerminalEvent::BreadcrumbsChanged => {
                let title = terminal.read(cx).title(true);
                if !title.trim().is_empty() {
                    if let Some(tab) = self.terminal_tabs.iter_mut().find(|tab| tab.id == tab_id) {
                        tab.title = title;
                        tab.status = "Running".into();
                    }
                }
                cx.notify();
            }
            TerminalEvent::Bell => {
                if let Some(tab) = self.terminal_tabs.iter_mut().find(|tab| tab.id == tab_id) {
                    tab.status = "Bell".into();
                }
                cx.notify();
            }
            TerminalEvent::CloseTerminal => {
                if let Some(index) = self.terminal_tabs.iter().position(|tab| tab.id == tab_id) {
                    self.remove_terminal_tab(index);
                    cx.notify();
                }
            }
            TerminalEvent::Wakeup
            | TerminalEvent::BlinkChanged(_)
            | TerminalEvent::SelectionsChanged => {
                if let Some(tab) = self.terminal_tabs.iter_mut().find(|tab| tab.id == tab_id) {
                    if tab.status.as_ref() == "Bell" {
                        tab.status = "Running".into();
                    }
                }
                cx.notify();
            }
            TerminalEvent::NewNavigationTarget(_) | TerminalEvent::Open(_) => {}
        }
    }

    fn paste_into_active_terminal(&mut self, cx: &mut Context<Self>) {
        let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) else {
            return;
        };
        let Some(terminal) = self.active_terminal() else {
            return;
        };
        terminal.update(cx, |terminal, cx| {
            terminal.paste(&text);
            cx.notify();
        });
        cx.notify();
    }

    fn copy_from_active_terminal(&mut self, cx: &mut Context<Self>) {
        let Some(terminal) = self.active_terminal() else {
            return;
        };
        terminal.update(cx, |terminal, cx| {
            terminal.copy(None);
            cx.notify();
        });
        cx.notify();
    }

    fn adjust_terminal_font_size(&mut self, delta: f32, cx: &mut Context<Self>) {
        self.terminal_display_settings.zoom_by(delta);
        self.persist_terminal_display_settings();
        cx.notify();
    }

    fn reset_terminal_font_size(&mut self, cx: &mut Context<Self>) {
        self.terminal_display_settings.reset_zoom();
        self.persist_terminal_display_settings();
        cx.notify();
    }

    fn scroll_active_terminal(&mut self, scroll: TerminalScroll, cx: &mut Context<Self>) {
        let Some(terminal) = self.active_terminal() else {
            return;
        };
        terminal.update(cx, |terminal, cx| {
            match scroll {
                TerminalScroll::LineUp => terminal.scroll_line_up(),
                TerminalScroll::LineDown => terminal.scroll_line_down(),
                TerminalScroll::PageUp => terminal.scroll_page_up(),
                TerminalScroll::PageDown => terminal.scroll_page_down(),
                TerminalScroll::Top => terminal.scroll_to_top(),
                TerminalScroll::Bottom => terminal.scroll_to_bottom(),
            }
            cx.notify();
        });
        cx.notify();
    }

    fn on_modifiers_changed(
        &mut self,
        event: &ModifiersChangedEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(terminal) = self.active_terminal() else {
            return;
        };
        terminal.update(cx, |terminal, cx| {
            terminal.try_modifiers_change(&event.modifiers, window, cx);
        });
    }

    fn persist_selected_workspace(&self) {
        let (Some(state), Some(workspace_id)) = (&self.state, &self.selected_workspace_id) else {
            return;
        };
        if let Err(err) =
            settings_repository::set_value(&state.db, GPUI_SELECTED_WORKSPACE_KEY, workspace_id)
        {
            log::warn!(target: "mnemonic_app", "failed to persist selected workspace: {err}");
        }
    }

    fn persist_terminal_display_settings(&self) {
        if let Err(err) = self.terminal_display_settings.persist(self.state.as_ref()) {
            log::warn!(target: "mnemonic_app", "failed to persist terminal display settings: {err}");
        }
    }

    fn on_terminal_key_down(
        &mut self,
        event: &KeyDownEvent,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(tab) = self.terminal_tabs.get(self.active_tab) else {
            return;
        };
        let Some(terminal) = tab.terminal.clone() else {
            return;
        };
        let handled = terminal.update(cx, |terminal, _cx| {
            terminal.try_keystroke(&event.keystroke, true)
        });
        if handled {
            cx.stop_propagation();
            cx.notify();
        }
    }
}

impl Render for MnemonicApp {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.poll_self_test(cx);
        window.set_window_title(&self.window_title());
        let selected_workspace_id = self.selected_workspace_id.clone();
        let sidebar = self.workspaces.iter().fold(
            div()
                .id("workspace-sidebar")
                .w(px(320.0))
                .h_full()
                .bg(rgb(0x151821))
                .border_r_1()
                .border_color(rgb(0x2a2f3a))
                .overflow_scroll()
                .p_3()
                .flex()
                .flex_col()
                .gap_2()
                .child(
                    div()
                        .text_color(rgb(0xf2f4f8))
                        .text_lg()
                        .font_weight(gpui::FontWeight::SEMIBOLD)
                        .child("Workspaces"),
                )
                .child(
                    div()
                        .text_color(rgb(0x8f9aaa))
                        .text_xs()
                        .mb_2()
                        .child(self.status.clone()),
                ),
            |list, workspace| {
                let id = workspace.id.clone();
                let selected = selected_workspace_id.as_deref() == Some(workspace.id.as_str());
                list.child(
                    div()
                        .id(format!("workspace-{}", workspace.id))
                        .rounded_md()
                        .p_2()
                        .bg(if selected {
                            rgb(0x263249)
                        } else {
                            rgb(0x1b1f2a)
                        })
                        .hover(|style| style.bg(rgb(0x273043)))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.selected_workspace_id = Some(id.clone());
                            this.persist_selected_workspace();
                            this.ensure_terminal_for_selection(cx);
                            cx.notify();
                        }))
                        .child(
                            div()
                                .text_color(rgb(0xf4f7fb))
                                .text_sm()
                                .font_weight(gpui::FontWeight::MEDIUM)
                                .child(workspace.name.clone()),
                        )
                        .child(
                            div()
                                .text_color(rgb(0xa3adbc))
                                .text_xs()
                                .child(format!("{} · {}", workspace.repo, workspace.branch)),
                        )
                        .child(div().text_color(rgb(0x7f8ba0)).text_xs().child(format!(
                            "{} · {} files",
                            workspace.status,
                            workspace.changed_files.len()
                        ))),
                )
            },
        );

        let content = if let Some(workspace) = self.selected_workspace() {
            let workspace_name = workspace.name.clone();
            let workspace_repo = workspace.repo.clone();
            let workspace_branch = workspace.branch.clone();
            let terminal_panel = self.render_terminal_panel(window, cx);
            div()
                .flex_1()
                .h_full()
                .bg(rgb(0x0f1117))
                .p_5()
                .flex()
                .flex_col()
                .gap_4()
                .child(
                    div()
                        .text_color(rgb(0xf4f7fb))
                        .text_2xl()
                        .font_weight(gpui::FontWeight::SEMIBOLD)
                        .child(workspace_name),
                )
                .child(
                    div()
                        .text_color(rgb(0xa3adbc))
                        .text_sm()
                        .child(format!("{} on {}", workspace_repo, workspace_branch)),
                )
                .child(terminal_panel)
        } else {
            div()
                .flex_1()
                .h_full()
                .bg(rgb(0x0f1117))
                .flex()
                .items_center()
                .justify_center()
                .text_color(rgb(0x8793a6))
                .child("No workspaces found in the Mnemonic database")
        };

        div()
            .size_full()
            .flex()
            .track_focus(&self.focus_handle)
            .on_action(cx.listener(|this, _: &NewTerminal, _, cx| {
                this.spawn_terminal_for_selection(TerminalLaunch::Shell, cx);
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &NewClaudeTerminal, _, cx| {
                this.spawn_terminal_for_selection(TerminalLaunch::Claude, cx);
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &CloseTerminal, _, cx| {
                this.close_active_terminal(cx);
            }))
            .on_action(cx.listener(|this, _: &CopyTerminal, _, cx| {
                this.copy_from_active_terminal(cx);
            }))
            .on_action(cx.listener(|this, _: &PasteTerminal, _, cx| {
                this.paste_into_active_terminal(cx);
            }))
            .on_action(cx.listener(|this, _: &IncreaseTerminalFontSize, _, cx| {
                this.adjust_terminal_font_size(1.0, cx);
            }))
            .on_action(cx.listener(|this, _: &DecreaseTerminalFontSize, _, cx| {
                this.adjust_terminal_font_size(-1.0, cx);
            }))
            .on_action(cx.listener(|this, _: &ResetTerminalFontSize, _, cx| {
                this.reset_terminal_font_size(cx);
            }))
            .on_action(cx.listener(|this, _: &ScrollTerminalLineUp, _, cx| {
                this.scroll_active_terminal(TerminalScroll::LineUp, cx);
            }))
            .on_action(cx.listener(|this, _: &ScrollTerminalLineDown, _, cx| {
                this.scroll_active_terminal(TerminalScroll::LineDown, cx);
            }))
            .on_action(cx.listener(|this, _: &ScrollTerminalPageUp, _, cx| {
                this.scroll_active_terminal(TerminalScroll::PageUp, cx);
            }))
            .on_action(cx.listener(|this, _: &ScrollTerminalPageDown, _, cx| {
                this.scroll_active_terminal(TerminalScroll::PageDown, cx);
            }))
            .on_action(cx.listener(|this, _: &ScrollTerminalToTop, _, cx| {
                this.scroll_active_terminal(TerminalScroll::Top, cx);
            }))
            .on_action(cx.listener(|this, _: &ScrollTerminalToBottom, _, cx| {
                this.scroll_active_terminal(TerminalScroll::Bottom, cx);
            }))
            .on_action(cx.listener(|this, _: &SwitchTerminal1, _, cx| this.switch_terminal(0, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal2, _, cx| this.switch_terminal(1, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal3, _, cx| this.switch_terminal(2, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal4, _, cx| this.switch_terminal(3, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal5, _, cx| this.switch_terminal(4, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal6, _, cx| this.switch_terminal(5, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal7, _, cx| this.switch_terminal(6, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal8, _, cx| this.switch_terminal(7, cx)))
            .on_action(cx.listener(|this, _: &SwitchTerminal9, _, cx| this.switch_terminal(8, cx)))
            .on_modifiers_changed(cx.listener(Self::on_modifiers_changed))
            .on_key_down(cx.listener(Self::on_terminal_key_down))
            .child(sidebar)
            .child(content)
    }
}

impl MnemonicApp {
    fn render_terminal_panel(
        &mut self,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let mut panel = div()
            .rounded_lg()
            .border_1()
            .border_color(rgb(0x2a2f3a))
            .bg(rgb(0x05070b))
            .flex_1()
            .overflow_hidden()
            .flex()
            .flex_col();

        let tab_bar = self.terminal_tabs.iter().enumerate().fold(
            div()
                .flex()
                .items_center()
                .gap_1()
                .p_2()
                .bg(rgb(0x10131a))
                .border_b_1()
                .border_color(rgb(0x2a2f3a))
                .child(
                    div()
                        .id("new-shell-tab")
                        .rounded_md()
                        .px_2()
                        .py_1()
                        .bg(rgb(0x1b1f2a))
                        .text_color(rgb(0xd7dde8))
                        .text_xs()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.spawn_terminal_for_selection(TerminalLaunch::Shell, cx);
                            cx.notify();
                        }))
                        .child("+ Shell"),
                )
                .child(
                    div()
                        .id("new-claude-tab")
                        .rounded_md()
                        .px_2()
                        .py_1()
                        .bg(rgb(0x1b1f2a))
                        .text_color(rgb(0xd7dde8))
                        .text_xs()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.spawn_terminal_for_selection(TerminalLaunch::Claude, cx);
                            cx.notify();
                        }))
                        .child("+ Claude"),
                ),
            |bar, (index, tab)| {
                let selected = index == self.active_tab;
                bar.child(
                    div()
                        .id(format!("terminal-tab-{index}"))
                        .rounded_md()
                        .px_2()
                        .py_1()
                        .bg(if selected {
                            rgb(0x263249)
                        } else {
                            rgb(0x191d27)
                        })
                        .text_color(if selected {
                            rgb(0xf4f7fb)
                        } else {
                            rgb(0x9aa4b2)
                        })
                        .text_xs()
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.active_tab = index;
                            cx.notify();
                        }))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap_1()
                                .child(format!("{} {}", index + 1, tab.title))
                                .child(
                                    div()
                                        .text_color(if selected {
                                            rgb(0xa3adbc)
                                        } else {
                                            rgb(0x697386)
                                        })
                                        .child(format!("· {}", tab.status)),
                                ),
                        ),
                )
            },
        );
        panel = panel.child(tab_bar);

        let Some(tab) = self.terminal_tabs.get(self.active_tab) else {
            return panel.child(
                div()
                    .flex_1()
                    .p_4()
                    .text_color(rgb(0x8793a6))
                    .child("No terminal tab"),
            );
        };

        if let Some(terminal) = tab.terminal.clone() {
            panel.child(render_terminal_surface(
                terminal,
                self.focus_handle.clone(),
                self.terminal_display_settings.clone(),
                cx,
            ))
        } else {
            panel.child(
                div()
                    .flex_1()
                    .p_4()
                    .text_color(rgb(0x8793a6))
                    .child(tab.status.clone())
                    .child(
                        div()
                            .mt_2()
                            .text_xs()
                            .child(format!("cwd: {}", tab.cwd.display())),
                    ),
            )
        }
    }
}

fn terminal_content_tail(content: &str) -> String {
    let mut lines = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .rev()
        .take(8)
        .collect::<Vec<_>>();
    lines.reverse();
    lines.join(" | ")
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
