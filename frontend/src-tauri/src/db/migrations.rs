use rusqlite::Connection;

pub fn run(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                repo TEXT NOT NULL,
                branch TEXT NOT NULL,
                agent TEXT NOT NULL,
                status TEXT NOT NULL,
                current_step TEXT NOT NULL,
                completed_steps TEXT NOT NULL DEFAULT '[]',
                last_updated TEXT NOT NULL,
                pr_status TEXT,
                pr_number INTEGER,
                description TEXT NOT NULL,
                current_task TEXT NOT NULL,
                ahead_by INTEGER NOT NULL DEFAULT 0,
                behind_by INTEGER NOT NULL DEFAULT 0,
                merge_risk TEXT NOT NULL,
                last_rebase TEXT NOT NULL,
                base_branch TEXT NOT NULL,
                agent_session_id TEXT NOT NULL,
                agent_session_agent TEXT NOT NULL,
                agent_session_status TEXT NOT NULL,
                agent_session_model TEXT NOT NULL,
                agent_session_token_count INTEGER NOT NULL DEFAULT 0,
                agent_session_estimated_cost TEXT NOT NULL,
                agent_session_last_message TEXT NOT NULL,
                agent_session_started_at TEXT NOT NULL,
                repository_id TEXT,
                repository_path TEXT,
                selected_branch TEXT,
                selected_worktree_id TEXT,
                selected_worktree_path TEXT,
                workspace_root_path TEXT,
                worktree_managed_by_forge INTEGER NOT NULL DEFAULT 0,
                workspace_source TEXT NOT NULL DEFAULT 'unknown',
                parent_workspace_id TEXT,
                source_workspace_id TEXT,
                derived_from_branch TEXT,
                worktree_path TEXT NOT NULL,
                recent_events TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS changed_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id TEXT NOT NULL,
                path TEXT NOT NULL,
                additions INTEGER NOT NULL DEFAULT 0,
                deletions INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_changed_files_workspace_id
                ON changed_files(workspace_id, sort_order);

            CREATE TABLE IF NOT EXISTS activity_items (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                repo TEXT NOT NULL,
                branch TEXT,
                event TEXT NOT NULL,
                level TEXT NOT NULL,
                details TEXT,
                timestamp TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_activity_items_created_at
                ON activity_items(created_at DESC);

            CREATE TABLE IF NOT EXISTS review_items (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                repo TEXT NOT NULL,
                branch TEXT NOT NULL,
                risk TEXT NOT NULL,
                files_changed INTEGER NOT NULL DEFAULT 0,
                additions INTEGER NOT NULL DEFAULT 0,
                deletions INTEGER NOT NULL DEFAULT 0,
                ai_summary TEXT NOT NULL,
                author TEXT NOT NULL,
                created_at_label TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_review_items_created_at
                ON review_items(created_at DESC);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS repositories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                current_branch TEXT,
                head TEXT,
                is_dirty INTEGER NOT NULL DEFAULT 0,
                last_scanned_at TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_repositories_path
                ON repositories(path);

            CREATE TABLE IF NOT EXISTS discovered_worktrees (
                id TEXT PRIMARY KEY,
                repo_id TEXT NOT NULL,
                path TEXT NOT NULL,
                branch TEXT,
                head TEXT,
                is_dirty INTEGER NOT NULL DEFAULT 0,
                is_detached INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
                UNIQUE(repo_id, path)
            );

            CREATE INDEX IF NOT EXISTS idx_discovered_worktrees_repo_id
                ON discovered_worktrees(repo_id);

            CREATE TABLE IF NOT EXISTS workspace_runs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                command TEXT NOT NULL,
                args TEXT NOT NULL DEFAULT '[]',
                cwd TEXT NOT NULL,
                status TEXT NOT NULL,
                pid INTEGER,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                exit_code INTEGER,
                error_message TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_workspace_runs_workspace_status
                ON workspace_runs(workspace_id, status);

            CREATE TABLE IF NOT EXISTS workspace_run_logs (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                stream_type TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (run_id) REFERENCES workspace_runs(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_workspace_run_logs_run_id
                ON workspace_run_logs(run_id, created_at);

            CREATE TABLE IF NOT EXISTS review_summaries (
                workspace_id TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                risk_reasons TEXT NOT NULL DEFAULT '[]',
                files_changed INTEGER NOT NULL DEFAULT 0,
                files_flagged INTEGER NOT NULL DEFAULT 0,
                additions INTEGER NOT NULL DEFAULT 0,
                deletions INTEGER NOT NULL DEFAULT 0,
                generated_at TEXT NOT NULL,
                file_insights TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS merge_readiness (
                workspace_id TEXT PRIMARY KEY,
                merge_ready INTEGER NOT NULL DEFAULT 0,
                readiness_level TEXT NOT NULL,
                reasons TEXT NOT NULL DEFAULT '[]',
                warnings TEXT NOT NULL DEFAULT '[]',
                ahead_count INTEGER,
                behind_count INTEGER,
                active_run_status TEXT,
                review_risk_level TEXT,
                generated_at TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS terminal_sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                session_role TEXT NOT NULL DEFAULT 'agent',
                profile TEXT NOT NULL,
                cwd TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                command TEXT NOT NULL,
                args TEXT NOT NULL DEFAULT '[]',
                pid INTEGER,
                stale INTEGER NOT NULL DEFAULT 0,
                closed_at TEXT,
                backend TEXT NOT NULL DEFAULT 'pty',
                tmux_session_name TEXT,
                title TEXT NOT NULL DEFAULT '',
                terminal_kind TEXT NOT NULL DEFAULT 'agent',
                display_order INTEGER NOT NULL DEFAULT 0,
                is_visible INTEGER NOT NULL DEFAULT 1,
                last_attached_at TEXT,
                last_captured_seq INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_terminal_sessions_workspace_status
                ON terminal_sessions(workspace_id, status);

            CREATE TABLE IF NOT EXISTS terminal_output_chunks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                stream_type TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE,
                UNIQUE(session_id, seq)
            );

            CREATE INDEX IF NOT EXISTS idx_terminal_output_chunks_session_seq
                ON terminal_output_chunks(session_id, seq);

            CREATE TABLE IF NOT EXISTS terminal_prompt_entries (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                session_id TEXT,
                profile TEXT NOT NULL,
                prompt TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                sent_at TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES terminal_sessions(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_terminal_prompt_entries_workspace_created
                ON terminal_prompt_entries(workspace_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS workspace_attention_reads (
                workspace_id TEXT PRIMARY KEY,
                last_read_at TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS workspace_linked_worktrees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id TEXT NOT NULL,
                worktree_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(workspace_id, worktree_id),
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                FOREIGN KEY (worktree_id) REFERENCES discovered_worktrees(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_workspace_linked_worktrees_workspace
                ON workspace_linked_worktrees(workspace_id);

            CREATE TABLE IF NOT EXISTS pr_drafts (
                workspace_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                key_changes TEXT NOT NULL DEFAULT '[]',
                risks TEXT NOT NULL DEFAULT '[]',
                testing_notes TEXT NOT NULL DEFAULT '[]',
                generated_at TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );


            CREATE TABLE IF NOT EXISTS workspace_file_reviews (
                workspace_id TEXT NOT NULL,
                path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'unreviewed',
                reviewed_at TEXT,
                reviewed_by TEXT NOT NULL DEFAULT 'local',
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (workspace_id, path),
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_workspace_file_reviews_workspace
                ON workspace_file_reviews(workspace_id, status);

            CREATE TABLE IF NOT EXISTS workspace_pr_comments (
                workspace_id TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'github',
                comment_id TEXT NOT NULL,
                author TEXT NOT NULL,
                body TEXT NOT NULL,
                path TEXT,
                line INTEGER,
                url TEXT,
                state TEXT NOT NULL DEFAULT 'open',
                created_at_remote TEXT,
                resolved_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (workspace_id, provider, comment_id),
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_workspace_pr_comments_workspace_path
                ON workspace_pr_comments(workspace_id, path, line);
            "#,
        )
        .map_err(|err| format!("Failed to run SQLite migrations: {err}"))?;

    add_column_if_missing(connection, "workspaces", "repository_id", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "repository_path", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "selected_branch", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "selected_worktree_id", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "selected_worktree_path", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "workspace_root_path", "TEXT")?;
    add_column_if_missing(
        connection,
        "workspaces",
        "worktree_managed_by_forge",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(
        connection,
        "workspaces",
        "workspace_source",
        "TEXT NOT NULL DEFAULT 'unknown'",
    )?;
    add_column_if_missing(connection, "workspaces", "parent_workspace_id", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "source_workspace_id", "TEXT")?;
    add_column_if_missing(connection, "workspaces", "derived_from_branch", "TEXT")?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "session_role",
        "TEXT NOT NULL DEFAULT 'agent'",
    )?;
    add_column_if_missing(connection, "terminal_sessions", "closed_at", "TEXT")?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "backend",
        "TEXT NOT NULL DEFAULT 'pty'",
    )?;
    add_column_if_missing(connection, "terminal_sessions", "tmux_session_name", "TEXT")?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "title",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "terminal_kind",
        "TEXT NOT NULL DEFAULT 'agent'",
    )?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "display_order",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "is_visible",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    add_column_if_missing(connection, "terminal_sessions", "last_attached_at", "TEXT")?;
    add_column_if_missing(
        connection,
        "terminal_sessions",
        "last_captured_seq",
        "INTEGER NOT NULL DEFAULT 0",
    )?;

    Ok(())
}

fn add_column_if_missing(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|err| format!("Failed to inspect table {table}: {err}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| format!("Failed to list columns for {table}: {err}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("Failed to read columns for {table}: {err}"))?;

    if !columns.iter().any(|existing| existing == column) {
        connection
            .execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
                [],
            )
            .map_err(|err| format!("Failed to add column {column} to {table}: {err}"))?;
    }

    Ok(())
}
