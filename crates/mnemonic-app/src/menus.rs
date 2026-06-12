use gpui::{App, KeyBinding, Menu, MenuItem, SystemMenuType};

use crate::{
    CloseTerminal, CopyTerminal, DecreaseTerminalFontSize, IncreaseTerminalFontSize,
    NewClaudeTerminal, NewTerminal, PasteTerminal, Quit, ResetTerminalFontSize,
    ScrollTerminalLineDown, ScrollTerminalLineUp, ScrollTerminalPageDown, ScrollTerminalPageUp,
    ScrollTerminalToBottom, ScrollTerminalToTop, SwitchTerminal1, SwitchTerminal2, SwitchTerminal3,
    SwitchTerminal4, SwitchTerminal5, SwitchTerminal6, SwitchTerminal7, SwitchTerminal8,
    SwitchTerminal9,
};

pub(crate) fn set_app_menus(cx: &mut App) {
    cx.set_menus([
        Menu::new("Mnemonic").items([
            MenuItem::os_submenu("Services", SystemMenuType::Services),
            MenuItem::separator(),
            MenuItem::action("Quit Mnemonic", Quit),
        ]),
        Menu::new("File").items([
            MenuItem::action("New Shell Terminal", NewTerminal),
            MenuItem::action("New Claude Terminal", NewClaudeTerminal),
            MenuItem::separator(),
            MenuItem::action("Close Terminal", CloseTerminal),
            MenuItem::separator(),
            MenuItem::action("Copy", CopyTerminal),
            MenuItem::action("Paste", PasteTerminal),
        ]),
        Menu::new("Terminal").items([
            MenuItem::action("Increase Font Size", IncreaseTerminalFontSize),
            MenuItem::action("Decrease Font Size", DecreaseTerminalFontSize),
            MenuItem::action("Reset Font Size", ResetTerminalFontSize),
            MenuItem::separator(),
            MenuItem::action("Scroll Line Up", ScrollTerminalLineUp),
            MenuItem::action("Scroll Line Down", ScrollTerminalLineDown),
            MenuItem::action("Scroll Page Up", ScrollTerminalPageUp),
            MenuItem::action("Scroll Page Down", ScrollTerminalPageDown),
            MenuItem::action("Scroll To Top", ScrollTerminalToTop),
            MenuItem::action("Scroll To Bottom", ScrollTerminalToBottom),
            MenuItem::separator(),
            MenuItem::action("Terminal 1", SwitchTerminal1),
            MenuItem::action("Terminal 2", SwitchTerminal2),
            MenuItem::action("Terminal 3", SwitchTerminal3),
            MenuItem::action("Terminal 4", SwitchTerminal4),
            MenuItem::action("Terminal 5", SwitchTerminal5),
            MenuItem::action("Terminal 6", SwitchTerminal6),
            MenuItem::action("Terminal 7", SwitchTerminal7),
            MenuItem::action("Terminal 8", SwitchTerminal8),
            MenuItem::action("Terminal 9", SwitchTerminal9),
        ]),
    ]);
    cx.set_dock_menu(vec![
        MenuItem::action("New Shell Terminal", NewTerminal),
        MenuItem::action("New Claude Terminal", NewClaudeTerminal),
    ]);
}

pub(crate) fn quit(_: &Quit, cx: &mut App) {
    cx.quit();
}

pub(crate) fn bind_app_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("cmd-q", Quit, None),
        KeyBinding::new("cmd-t", NewTerminal, None),
        KeyBinding::new("cmd-shift-t", NewClaudeTerminal, None),
        KeyBinding::new("cmd-w", CloseTerminal, None),
        KeyBinding::new("cmd-c", CopyTerminal, None),
        KeyBinding::new("cmd-v", PasteTerminal, None),
        KeyBinding::new("cmd-=", IncreaseTerminalFontSize, None),
        KeyBinding::new("cmd--", DecreaseTerminalFontSize, None),
        KeyBinding::new("cmd-0", ResetTerminalFontSize, None),
        KeyBinding::new("shift-pageup", ScrollTerminalPageUp, None),
        KeyBinding::new("shift-pagedown", ScrollTerminalPageDown, None),
        KeyBinding::new("cmd-up", ScrollTerminalToTop, None),
        KeyBinding::new("cmd-down", ScrollTerminalToBottom, None),
        KeyBinding::new("cmd-1", SwitchTerminal1, None),
        KeyBinding::new("cmd-2", SwitchTerminal2, None),
        KeyBinding::new("cmd-3", SwitchTerminal3, None),
        KeyBinding::new("cmd-4", SwitchTerminal4, None),
        KeyBinding::new("cmd-5", SwitchTerminal5, None),
        KeyBinding::new("cmd-6", SwitchTerminal6, None),
        KeyBinding::new("cmd-7", SwitchTerminal7, None),
        KeyBinding::new("cmd-8", SwitchTerminal8, None),
        KeyBinding::new("cmd-9", SwitchTerminal9, None),
    ]);
}
