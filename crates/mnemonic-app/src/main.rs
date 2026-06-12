mod app;
mod core;
mod display_settings;
mod menus;
mod shell;
mod terminal_canvas;
mod terminal_tab;
mod theme;

use std::sync::Arc;

use gpui::{actions, px, size, App, AppContext, Bounds, WindowBounds, WindowOptions};
use gpui_platform::application;

use crate::app::MnemonicApp;
use crate::menus::{bind_app_keys, quit, set_app_menus};

actions!(
    mnemonic_app,
    [
        Quit,
        NewTerminal,
        NewClaudeTerminal,
        CloseTerminal,
        CopyTerminal,
        PasteTerminal,
        IncreaseTerminalFontSize,
        DecreaseTerminalFontSize,
        ResetTerminalFontSize,
        ScrollTerminalLineUp,
        ScrollTerminalLineDown,
        ScrollTerminalPageUp,
        ScrollTerminalPageDown,
        ScrollTerminalToTop,
        ScrollTerminalToBottom,
        SwitchTerminal1,
        SwitchTerminal2,
        SwitchTerminal3,
        SwitchTerminal4,
        SwitchTerminal5,
        SwitchTerminal6,
        SwitchTerminal7,
        SwitchTerminal8,
        SwitchTerminal9,
        CycleTheme,
    ]
);

fn main() {
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("mnemonic_app=info,mnemonic_core=info"),
    )
    .format_timestamp_secs()
    .try_init();

    application().run(|cx: &mut App| {
        release_channel::init(semver::Version::new(0, 1, 0), cx);
        settings::init(cx);
        cx.on_action(quit);
        set_app_menus(cx);
        bind_app_keys(cx);
        let bounds = Bounds::centered(None, size(px(1200.0), px(800.0)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                titlebar: Some(gpui::TitlebarOptions {
                    title: Some("Mnemonic v3".into()),
                    ..Default::default()
                }),
                app_id: Some("dev.mnemonic.desktop".to_string()),
                tabbing_identifier: Some("dev.mnemonic.desktop".to_string()),
                icon: load_app_icon(),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| MnemonicApp::new(window, cx)),
        )
        .expect("open GPUI window");
        cx.activate(true);
    });
}

fn load_app_icon() -> Option<Arc<image::RgbaImage>> {
    let icon = image::load_from_memory_with_format(
        include_bytes!("../../../src-tauri/icons/icon.png"),
        image::ImageFormat::Png,
    )
    .map_err(|error| {
        log::warn!(target: "mnemonic_app", "Failed to load bundled app icon: {error}");
        error
    })
    .ok()?
    .into_rgba8();
    Some(Arc::new(icon))
}
