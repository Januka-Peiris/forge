pub mod regex;
pub mod tree_sitter;

use std::collections::HashSet;
use crate::context::schema::RepoSymbol;

pub struct ExtractResult {
    pub symbols: Vec<RepoSymbol>,
    pub imports_internal: Vec<String>,
    pub content_preview: String,
    pub engine: String, // "tree-sitter" or "regex"
}

/// Try tree-sitter first; fall back to regex on failure.
pub fn extract(path: &str, content: &str, repo_files: &HashSet<String>) -> ExtractResult {
    let content_preview: String = content.chars().take(500).collect();

    if let Some((symbols, imports_internal)) = tree_sitter::extract(path, content, repo_files) {
        return ExtractResult {
            symbols,
            imports_internal,
            content_preview,
            engine: "tree-sitter".to_string(),
        };
    }

    let result = regex::extract(path, content, repo_files);
    ExtractResult {
        symbols: result.symbols,
        imports_internal: result.imports_internal,
        content_preview,
        engine: "regex".to_string(),
    }
}
