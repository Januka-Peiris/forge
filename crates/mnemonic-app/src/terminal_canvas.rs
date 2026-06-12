use gpui::{
    canvas, div, fill, point, px, rgb, size, App, Bounds, ContentMask, Context, Entity,
    FocusHandle, FontStyle, Hsla, InteractiveElement, IntoElement, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, ParentElement, Pixels, ScrollWheelEvent, Styled, TextAlign,
    TextRun, Window,
};
use terminal::{Color, CursorShape, NamedColor, Rgb, Terminal, TerminalBounds};

use crate::app::MnemonicApp;
use crate::display_settings::TerminalDisplaySettings;

const MIN_TERMINAL_COLUMNS: f32 = 20.0;
const MIN_TERMINAL_ROWS: f32 = 5.0;
const DEFAULT_BACKGROUND_RGB: u32 = 0x05070b;
const DEFAULT_FOREGROUND_RGB: u32 = 0xd7dde8;
const SELECTION_BACKGROUND_RGB: u32 = 0x244b7a;

#[derive(Clone)]
struct PaintRun {
    line: i32,
    column: usize,
    cell_count: usize,
    text: String,
    fg: Hsla,
    bold: bool,
    italic: bool,
}

impl PaintRun {
    fn can_append(&self, line: i32, column: usize, fg: Hsla, bold: bool, italic: bool) -> bool {
        self.line == line
            && self.column + self.cell_count == column
            && self.fg == fg
            && self.bold == bold
            && self.italic == italic
    }

    fn append(&mut self, ch: char, counts_cell: bool) {
        self.text.push(ch);
        if counts_cell {
            self.cell_count += 1;
        }
    }
}

#[derive(Clone)]
struct PaintRect {
    line: i32,
    column: usize,
    cell_count: usize,
    color: Hsla,
}

struct TerminalPaintState {
    terminal_bounds: TerminalBounds,
    runs: Vec<PaintRun>,
    rects: Vec<PaintRect>,
    selection_rects: Vec<PaintRect>,
    cursor: Option<PaintCursor>,
}

struct PaintCursor {
    line: i32,
    column: usize,
    color: Hsla,
    shape: PaintCursorShape,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PaintCursorShape {
    Block,
    HollowBlock,
    Underline,
    Bar,
}

pub(crate) fn render_terminal_surface(
    terminal: Entity<Terminal>,
    focus_handle: FocusHandle,
    display_settings: TerminalDisplaySettings,
    cx: &mut Context<MnemonicApp>,
) -> impl IntoElement {
    let scroll_terminal = terminal.clone();
    let mouse_down_terminal = terminal.clone();
    let mouse_down_focus = focus_handle.clone();
    let mouse_move_terminal = terminal.clone();
    let mouse_up_terminal = terminal.clone();
    let middle_down_terminal = terminal.clone();
    let middle_down_focus = focus_handle.clone();
    let middle_up_terminal = terminal.clone();
    let right_down_terminal = terminal.clone();
    let right_down_focus = focus_handle.clone();
    let right_up_terminal = terminal.clone();
    div()
        .id("mnemonic-terminal-surface")
        .flex_1()
        .overflow_hidden()
        .on_mouse_down(MouseButton::Left, move |event, window, cx| {
            window.focus(&mouse_down_focus, cx);
            mouse_down_terminal.update(cx, |terminal, cx| {
                terminal.mouse_down(event, cx);
                cx.notify();
            });
        })
        .on_mouse_move(move |event: &MouseMoveEvent, _, cx| {
            mouse_move_terminal.update(cx, |terminal, cx| {
                if event.pressed_button.is_some() {
                    let region = terminal.last_content().terminal_bounds.bounds;
                    terminal.mouse_drag(event, region, cx);
                }
                terminal.mouse_move(event, cx);
                cx.notify();
            });
        })
        .on_mouse_up(MouseButton::Left, move |event: &MouseUpEvent, _, cx| {
            mouse_up_terminal.update(cx, |terminal, cx| {
                terminal.mouse_up(event, cx);
                cx.notify();
            });
        })
        .on_mouse_down(
            MouseButton::Middle,
            move |event: &MouseDownEvent, window, cx| {
                window.focus(&middle_down_focus, cx);
                middle_down_terminal.update(cx, |terminal, cx| {
                    terminal.mouse_down(event, cx);
                    cx.notify();
                });
            },
        )
        .on_mouse_up(MouseButton::Middle, move |event: &MouseUpEvent, _, cx| {
            middle_up_terminal.update(cx, |terminal, cx| {
                terminal.mouse_up(event, cx);
                cx.notify();
            });
        })
        .on_mouse_down(
            MouseButton::Right,
            move |event: &MouseDownEvent, window, cx| {
                window.focus(&right_down_focus, cx);
                right_down_terminal.update(cx, |terminal, cx| {
                    terminal.mouse_down(event, cx);
                    cx.notify();
                });
            },
        )
        .on_mouse_up(MouseButton::Right, move |event: &MouseUpEvent, _, cx| {
            right_up_terminal.update(cx, |terminal, cx| {
                terminal.mouse_up(event, cx);
                cx.notify();
            });
        })
        .on_scroll_wheel(cx.listener(move |_, event: &ScrollWheelEvent, _, cx| {
            scroll_terminal.update(cx, |terminal, cx| {
                terminal.scroll_wheel(event, 1.0);
                cx.notify();
            });
            cx.notify();
        }))
        .child(render_terminal_canvas(
            terminal,
            focus_handle,
            display_settings,
        ))
}

fn render_terminal_canvas(
    terminal: Entity<Terminal>,
    focus_handle: FocusHandle,
    display_settings: TerminalDisplaySettings,
) -> impl IntoElement {
    let terminal_for_prepaint = terminal.clone();
    let prepaint_display_settings = display_settings.clone();
    let prepaint_focus_handle = focus_handle.clone();
    canvas(
        move |bounds, window, cx| {
            let terminal_bounds = terminal_bounds_for_canvas(bounds, &prepaint_display_settings);
            let focused = prepaint_focus_handle.is_focused(window);
            let content = terminal_for_prepaint.update(cx, |terminal, cx| {
                terminal.set_size(terminal_bounds);
                terminal.sync(window, cx);
                terminal.last_content().clone()
            });
            layout_terminal_content(&content, terminal_bounds, focused)
        },
        move |bounds, paint_state, window, cx| {
            paint_terminal_content(bounds, paint_state, &display_settings, window, cx);
        },
    )
    .size_full()
    .bg(rgb(DEFAULT_BACKGROUND_RGB))
}

fn terminal_bounds_for_canvas(
    bounds: Bounds<Pixels>,
    display_settings: &TerminalDisplaySettings,
) -> TerminalBounds {
    let line_height = px(display_settings.line_height);
    let cell_width = px(display_settings.cell_width);
    let cols = (f32::from(bounds.size.width) / f32::from(cell_width))
        .floor()
        .max(MIN_TERMINAL_COLUMNS);
    let rows = (f32::from(bounds.size.height) / f32::from(line_height))
        .floor()
        .max(MIN_TERMINAL_ROWS);
    let snapped_size = size(
        px(cols * f32::from(cell_width)),
        px(rows * f32::from(line_height)),
    );
    TerminalBounds::new(
        line_height,
        cell_width,
        Bounds::new(bounds.origin, snapped_size),
    )
}

fn layout_terminal_content(
    content: &terminal::Content,
    terminal_bounds: TerminalBounds,
    focused: bool,
) -> TerminalPaintState {
    let rows = terminal_bounds.num_lines().max(1);
    let cols = terminal_bounds.num_columns().max(1);
    let mut runs: Vec<PaintRun> = Vec::new();
    let mut rects: Vec<PaintRect> = Vec::new();
    let selection_rects = layout_selection_rects(content, rows, cols);

    for indexed in &content.cells {
        let line = indexed.point.line;
        let column = indexed.point.column;
        if line < 0
            || (line as usize) >= rows
            || column >= cols
            || indexed.cell.is_wide_char_spacer()
        {
            continue;
        }

        let mut fg = terminal_color(indexed.cell.foreground(), false);
        let mut bg = terminal_color(indexed.cell.background(), true);
        if indexed.cell.is_inverse() {
            std::mem::swap(&mut fg, &mut bg);
        }
        if indexed.cell.is_dim() {
            fg.a *= 0.65;
        }

        if !is_default_terminal_background(bg) {
            push_rect(
                &mut rects,
                PaintRect {
                    line,
                    column,
                    cell_count: 1,
                    color: Hsla::from(bg),
                },
            );
        }

        let ch = indexed.cell.character();
        let has_zerowidth = indexed
            .cell
            .zerowidth()
            .map(|chars| !chars.is_empty())
            .unwrap_or(false);
        if ch != ' ' || has_zerowidth {
            push_run(
                &mut runs,
                line,
                column,
                ch,
                Hsla::from(fg),
                indexed.cell.is_bold(),
                indexed.cell.is_italic(),
            );
            if let Some(zerowidth) = indexed.cell.zerowidth() {
                if let Some(run) = runs.last_mut() {
                    for ch in zerowidth {
                        run.append(*ch, false);
                    }
                }
            }
        }
    }

    let cursor = layout_cursor(content, rows, cols, focused);

    TerminalPaintState {
        terminal_bounds,
        runs,
        rects,
        selection_rects,
        cursor,
    }
}

fn layout_selection_rects(content: &terminal::Content, rows: usize, cols: usize) -> Vec<PaintRect> {
    let Some(selection) = content.selection else {
        return Vec::new();
    };
    if rows == 0 || cols == 0 {
        return Vec::new();
    }

    let (start, end) = if selection.start <= selection.end {
        (selection.start, selection.end)
    } else {
        (selection.end, selection.start)
    };
    let color = Hsla::from(rgb(SELECTION_BACKGROUND_RGB));
    let mut rects = Vec::new();

    if selection.is_block {
        let start_col = start.column.min(end.column).min(cols.saturating_sub(1));
        let end_col = start.column.max(end.column).min(cols.saturating_sub(1));
        for line in start.line..=end.line {
            push_selection_rect(&mut rects, line, start_col, end_col, rows, cols, color);
        }
        return rects;
    }

    for line in start.line..=end.line {
        let start_col = if line == start.line { start.column } else { 0 };
        let end_col = if line == end.line {
            end.column
        } else {
            cols.saturating_sub(1)
        };
        push_selection_rect(&mut rects, line, start_col, end_col, rows, cols, color);
    }

    rects
}

fn push_selection_rect(
    rects: &mut Vec<PaintRect>,
    line: i32,
    start_col: usize,
    end_col: usize,
    rows: usize,
    cols: usize,
    color: Hsla,
) {
    if line < 0 || (line as usize) >= rows || start_col >= cols || end_col < start_col {
        return;
    }
    let end_col = end_col.min(cols.saturating_sub(1));
    rects.push(PaintRect {
        line,
        column: start_col,
        cell_count: end_col - start_col + 1,
        color,
    });
}

fn layout_cursor(
    content: &terminal::Content,
    rows: usize,
    cols: usize,
    focused: bool,
) -> Option<PaintCursor> {
    if matches!(content.cursor.shape, CursorShape::Hidden) {
        return None;
    }

    let line = content.cursor.point.line;
    let column = content.cursor.point.column;
    if line < 0 || (line as usize) >= rows || column >= cols {
        return None;
    }

    let shape = match content.cursor.shape {
        CursorShape::Block if focused => PaintCursorShape::Block,
        CursorShape::Block | CursorShape::HollowBlock => PaintCursorShape::HollowBlock,
        CursorShape::Underline if focused => PaintCursorShape::Underline,
        CursorShape::Bar if focused => PaintCursorShape::Bar,
        CursorShape::Underline | CursorShape::Bar => PaintCursorShape::HollowBlock,
        CursorShape::Hidden => return None,
    };

    Some(PaintCursor {
        line,
        column,
        color: Hsla::from(rgb(DEFAULT_FOREGROUND_RGB)),
        shape,
    })
}

fn push_run(
    runs: &mut Vec<PaintRun>,
    line: i32,
    column: usize,
    ch: char,
    fg: Hsla,
    bold: bool,
    italic: bool,
) {
    if let Some(last) = runs.last_mut() {
        if last.can_append(line, column, fg, bold, italic) {
            last.append(ch, true);
            return;
        }
    }
    let mut text = String::new();
    text.push(ch);
    runs.push(PaintRun {
        line,
        column,
        cell_count: 1,
        text,
        fg,
        bold,
        italic,
    });
}

fn push_rect(rects: &mut Vec<PaintRect>, rect: PaintRect) {
    if let Some(last) = rects.last_mut() {
        if last.line == rect.line
            && last.color == rect.color
            && last.column + last.cell_count == rect.column
        {
            last.cell_count += rect.cell_count;
            return;
        }
    }
    rects.push(rect);
}

fn paint_terminal_content(
    bounds: Bounds<Pixels>,
    paint_state: TerminalPaintState,
    display_settings: &TerminalDisplaySettings,
    window: &mut Window,
    cx: &mut App,
) {
    window.with_content_mask(Some(ContentMask { bounds }), |window| {
        window.paint_quad(fill(bounds, Hsla::from(rgb(DEFAULT_BACKGROUND_RGB))));
        let origin = bounds.origin;

        for rect in &paint_state.rects {
            paint_terminal_rect(rect, origin, paint_state.terminal_bounds, window);
        }
        for rect in &paint_state.selection_rects {
            paint_terminal_rect(rect, origin, paint_state.terminal_bounds, window);
        }
        if let Some(cursor) = &paint_state.cursor {
            if cursor.shape == PaintCursorShape::Block {
                paint_terminal_cursor(cursor, origin, paint_state.terminal_bounds, window);
            }
        }

        for run in &paint_state.runs {
            let mut font = gpui::font(display_settings.font_family.as_str());
            if run.bold {
                font.weight = gpui::FontWeight::BOLD;
            }
            if run.italic {
                font.style = FontStyle::Italic;
            }
            let text_run = TextRun {
                len: run.text.len(),
                font,
                color: run.fg,
                background_color: None,
                underline: None,
                strikethrough: None,
            };
            let position = point(
                origin.x + run.column as f32 * paint_state.terminal_bounds.cell_width(),
                origin.y + run.line as f32 * paint_state.terminal_bounds.line_height(),
            );
            let _ = window
                .text_system()
                .shape_line(
                    run.text.clone().into(),
                    px(display_settings.font_size),
                    std::slice::from_ref(&text_run),
                    Some(paint_state.terminal_bounds.cell_width()),
                )
                .paint(
                    position,
                    paint_state.terminal_bounds.line_height(),
                    TextAlign::Left,
                    None,
                    window,
                    cx,
                );
        }

        if let Some(cursor) = &paint_state.cursor {
            if cursor.shape != PaintCursorShape::Block {
                paint_terminal_cursor(cursor, origin, paint_state.terminal_bounds, window);
            }
        }
    });
}

fn paint_terminal_rect(
    rect: &PaintRect,
    origin: gpui::Point<Pixels>,
    terminal_bounds: TerminalBounds,
    window: &mut Window,
) {
    let position = point(
        origin.x + rect.column as f32 * terminal_bounds.cell_width(),
        origin.y + rect.line as f32 * terminal_bounds.line_height(),
    );
    let rect_size = size(
        terminal_bounds.cell_width() * rect.cell_count as f32,
        terminal_bounds.line_height(),
    );
    window.paint_quad(fill(Bounds::new(position, rect_size), rect.color));
}

fn paint_terminal_cursor(
    cursor: &PaintCursor,
    origin: gpui::Point<Pixels>,
    terminal_bounds: TerminalBounds,
    window: &mut Window,
) {
    let position = point(
        origin.x + cursor.column as f32 * terminal_bounds.cell_width(),
        origin.y + cursor.line as f32 * terminal_bounds.line_height(),
    );
    let full_size = size(terminal_bounds.cell_width(), terminal_bounds.line_height());
    match cursor.shape {
        PaintCursorShape::Block => {
            window.paint_quad(fill(Bounds::new(position, full_size), cursor.color));
        }
        PaintCursorShape::HollowBlock => {
            paint_hollow_cursor(position, full_size, cursor.color, window);
        }
        PaintCursorShape::Underline => {
            let thickness = px(2.0);
            let underline_origin = point(position.x, position.y + full_size.height - thickness);
            window.paint_quad(fill(
                Bounds::new(underline_origin, size(full_size.width, thickness)),
                cursor.color,
            ));
        }
        PaintCursorShape::Bar => {
            let thickness = px(2.0);
            window.paint_quad(fill(
                Bounds::new(position, size(thickness, full_size.height)),
                cursor.color,
            ));
        }
    }
}

fn paint_hollow_cursor(
    position: gpui::Point<Pixels>,
    cursor_size: gpui::Size<Pixels>,
    color: Hsla,
    window: &mut Window,
) {
    let thickness = px(1.0);
    let right_x = position.x + cursor_size.width - thickness;
    let bottom_y = position.y + cursor_size.height - thickness;

    for bounds in [
        Bounds::new(position, size(cursor_size.width, thickness)),
        Bounds::new(
            point(position.x, bottom_y),
            size(cursor_size.width, thickness),
        ),
        Bounds::new(position, size(thickness, cursor_size.height)),
        Bounds::new(
            point(right_x, position.y),
            size(thickness, cursor_size.height),
        ),
    ] {
        window.paint_quad(fill(bounds, color));
    }
}

fn is_default_terminal_background(color: gpui::Rgba) -> bool {
    let default = rgb(DEFAULT_BACKGROUND_RGB);
    (color.r - default.r).abs() < f32::EPSILON
        && (color.g - default.g).abs() < f32::EPSILON
        && (color.b - default.b).abs() < f32::EPSILON
        && (color.a - default.a).abs() < f32::EPSILON
}

fn terminal_color(color: Color, _is_background: bool) -> gpui::Rgba {
    match color {
        Color::Spec(rgb_color) => terminal_rgb(rgb_color),
        Color::Indexed(index) => indexed_terminal_color(index),
        Color::Named(named) => named_terminal_color(named),
    }
}

fn terminal_rgb(rgb_color: Rgb) -> gpui::Rgba {
    gpui::Rgba {
        r: rgb_color.r as f32 / 255.0,
        g: rgb_color.g as f32 / 255.0,
        b: rgb_color.b as f32 / 255.0,
        a: 1.0,
    }
}

fn named_terminal_color(color: NamedColor) -> gpui::Rgba {
    match color {
        NamedColor::Black | NamedColor::DimBlack => rgb(0x1b1f2a),
        NamedColor::Red | NamedColor::DimRed => rgb(0xff6b6b),
        NamedColor::Green | NamedColor::DimGreen => rgb(0x73d13d),
        NamedColor::Yellow | NamedColor::DimYellow => rgb(0xffd166),
        NamedColor::Blue | NamedColor::DimBlue => rgb(0x5aa9ff),
        NamedColor::Magenta | NamedColor::DimMagenta => rgb(0xd987ff),
        NamedColor::Cyan | NamedColor::DimCyan => rgb(0x5eead4),
        NamedColor::White | NamedColor::DimWhite => rgb(DEFAULT_FOREGROUND_RGB),
        NamedColor::BrightBlack => rgb(0x6b7280),
        NamedColor::BrightRed => rgb(0xff8a8a),
        NamedColor::BrightGreen => rgb(0x9be564),
        NamedColor::BrightYellow => rgb(0xffe08a),
        NamedColor::BrightBlue => rgb(0x80c0ff),
        NamedColor::BrightMagenta => rgb(0xe0a3ff),
        NamedColor::BrightCyan => rgb(0x8ff5e8),
        NamedColor::BrightWhite | NamedColor::BrightForeground => rgb(0xffffff),
        NamedColor::Foreground => rgb(DEFAULT_FOREGROUND_RGB),
        NamedColor::DimForeground => rgb(0x8793a6),
        NamedColor::Background => rgb(DEFAULT_BACKGROUND_RGB),
        NamedColor::Cursor => rgb(DEFAULT_FOREGROUND_RGB),
    }
}

fn indexed_terminal_color(index: u8) -> gpui::Rgba {
    const ANSI: [u32; 16] = [
        0x1b1f2a, 0xff6b6b, 0x73d13d, 0xffd166, 0x5aa9ff, 0xd987ff, 0x5eead4, 0xd7dde8, 0x6b7280,
        0xff8a8a, 0x9be564, 0xffe08a, 0x80c0ff, 0xe0a3ff, 0x8ff5e8, 0xffffff,
    ];
    match index {
        0..=15 => rgb(ANSI[index as usize]),
        16..=231 => {
            let i = index - 16;
            let r = i / 36;
            let g = (i % 36) / 6;
            let b = i % 6;
            let scale = |v: u8| if v == 0 { 0 } else { 55 + v as u32 * 40 };
            rgb((scale(r) << 16) | (scale(g) << 8) | scale(b))
        }
        232..=255 => {
            let level = 8 + (index as u32 - 232) * 10;
            rgb((level << 16) | (level << 8) | level)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use terminal::{Content, Cursor, Point, SelectionRange};

    #[test]
    fn cursor_layout_respects_hidden_shape() {
        let content = content_with_cursor(CursorShape::Hidden, 0, 0);

        assert!(layout_cursor(&content, 10, 10, true).is_none());
    }

    #[test]
    fn cursor_layout_maps_focus_sensitive_shapes() {
        let block = content_with_cursor(CursorShape::Block, 1, 2);
        let focused_block = layout_cursor(&block, 10, 10, true).expect("focused block");
        let blurred_block = layout_cursor(&block, 10, 10, false).expect("blurred block");

        assert_eq!(focused_block.shape, PaintCursorShape::Block);
        assert_eq!(focused_block.line, 1);
        assert_eq!(focused_block.column, 2);
        assert_eq!(blurred_block.shape, PaintCursorShape::HollowBlock);

        let underline = content_with_cursor(CursorShape::Underline, 0, 0);
        assert_eq!(
            layout_cursor(&underline, 10, 10, true)
                .expect("focused underline")
                .shape,
            PaintCursorShape::Underline
        );
        assert_eq!(
            layout_cursor(&underline, 10, 10, false)
                .expect("blurred underline")
                .shape,
            PaintCursorShape::HollowBlock
        );
    }

    #[test]
    fn cursor_layout_rejects_out_of_bounds_cursor() {
        let content = content_with_cursor(CursorShape::Block, 10, 0);

        assert!(layout_cursor(&content, 10, 10, true).is_none());
    }

    #[test]
    fn selection_layout_handles_multiline_ranges() {
        let content = content_with_selection(1, 3, 3, 2, false);

        let rects = layout_selection_rects(&content, 6, 10);

        assert_eq!(rects.len(), 3);
        assert_rect(&rects[0], 1, 3, 7);
        assert_rect(&rects[1], 2, 0, 10);
        assert_rect(&rects[2], 3, 0, 3);
    }

    #[test]
    fn selection_layout_handles_block_ranges() {
        let content = content_with_selection(1, 7, 3, 4, true);

        let rects = layout_selection_rects(&content, 6, 10);

        assert_eq!(rects.len(), 3);
        for (index, rect) in rects.iter().enumerate() {
            assert_rect(rect, index as i32 + 1, 4, 4);
        }
    }

    fn content_with_cursor(shape: CursorShape, line: i32, column: usize) -> Content {
        Content {
            cursor: Cursor {
                shape,
                point: Point { line, column },
            },
            ..Default::default()
        }
    }

    fn content_with_selection(
        start_line: i32,
        start_column: usize,
        end_line: i32,
        end_column: usize,
        is_block: bool,
    ) -> Content {
        Content {
            selection: Some(SelectionRange {
                start: Point {
                    line: start_line,
                    column: start_column,
                },
                end: Point {
                    line: end_line,
                    column: end_column,
                },
                is_block,
            }),
            ..Default::default()
        }
    }

    fn assert_rect(rect: &PaintRect, line: i32, column: usize, cell_count: usize) {
        assert_eq!(rect.line, line);
        assert_eq!(rect.column, column);
        assert_eq!(rect.cell_count, cell_count);
    }
}
