use crate::context::schema::{
    ContextCandidate, ContextSegment, RepoMapV2, RenderMode, WorkspaceOverlay, estimate_tokens,
};

pub fn fit_to_budget(
    candidates: Vec<ContextCandidate>,
    map: &RepoMapV2,
    overlay: &WorkspaceOverlay,
    target_tokens: u32,
) -> (Vec<ContextSegment>, Vec<String>) {
    let entry_map: std::collections::HashMap<&str, &crate::context::schema::RepoEntry> =
        map.entries.iter().map(|e| (e.path.as_str(), e)).collect();

    let mut included = Vec::new();
    let mut excluded = Vec::new();
    let mut used: u32 = 0;

    for mut candidate in candidates {
        loop {
            let content = render(&candidate, &entry_map, overlay);
            let tokens = estimate_tokens(&content);

            if candidate.mandatory || used + tokens <= target_tokens {
                used += tokens;
                included.push(ContextSegment {
                    path: candidate.path.clone(),
                    tier: if candidate.mandatory { "mandatory".to_string() } else { "related".to_string() },
                    render_mode: candidate.render_mode.as_str().to_string(),
                    estimated_tokens: tokens,
                    content,
                });
                break;
            }

            if candidate.render_mode.can_degrade() {
                candidate.render_mode = candidate.render_mode.degraded();
            } else {
                // Fully degraded and still over budget → exclude (unless mandatory)
                excluded.push(candidate.path);
                break;
            }
        }
    }

    (included, excluded)
}

fn render(
    candidate: &ContextCandidate,
    entry_map: &std::collections::HashMap<&str, &crate::context::schema::RepoEntry>,
    overlay: &WorkspaceOverlay,
) -> String {
    match &candidate.render_mode {
        RenderMode::Full => {
            // New file content from overlay
            if let Some(f) = overlay.new_files.iter().find(|f| f.path == candidate.path) {
                return format!("### {} (new file)\n{}", f.path, f.diff);
            }
            // Changed file diff
            if let Some(f) = overlay.changed.iter().find(|f| f.path == candidate.path) {
                return render_diff(f);
            }
            // Fall back to symbol card
            render_symbol_card(&candidate.path, entry_map)
        }
        RenderMode::DiffHunks => {
            if let Some(f) = overlay.changed.iter().find(|f| f.path == candidate.path) {
                return render_diff(f);
            }
            render_symbol_card(&candidate.path, entry_map)
        }
        RenderMode::SymbolCard => render_symbol_card(&candidate.path, entry_map),
        RenderMode::SummaryLine => {
            let summary = entry_map.get(candidate.path.as_str())
                .map(|e| e.summary.as_str())
                .unwrap_or("");
            format!("- {} — {}", candidate.path, summary)
        }
    }
}

fn render_diff(file: &crate::context::schema::OverlayFile) -> String {
    format!(
        "### {} (changed: +{} -{} lines)\n```diff\n{}\n```",
        file.path, file.additions, file.deletions, file.diff
    )
}

fn render_symbol_card(path: &str, entry_map: &std::collections::HashMap<&str, &crate::context::schema::RepoEntry>) -> String {
    let Some(entry) = entry_map.get(path) else {
        return format!("- {}", path);
    };
    let mut lines = vec![format!("### {} — {}", path, entry.summary)];
    for sym in entry.top_symbols.iter().take(5) {
        let sig = sym.signature.as_deref().unwrap_or(&sym.name);
        lines.push(format!("  {} {} (line {})", sym.kind, sig, sym.line_start));
    }
    if !entry.imports_internal.is_empty() {
        lines.push(format!("  imports: {}", entry.imports_internal.iter().take(4).cloned().collect::<Vec<_>>().join(", ")));
    }
    lines.join("\n")
}
