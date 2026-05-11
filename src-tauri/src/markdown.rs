use crate::db::models::{List, Tag, Todo};
use crate::error::AppResult;
use sqlx::SqlitePool;
use std::fmt::Write;

/// Render a single list to Markdown matching REQUIREMENTS §7.
pub async fn render_list(pool: &SqlitePool, list_id: i64) -> AppResult<String> {
    let list: List = sqlx::query_as("SELECT * FROM lists WHERE id = ?1")
        .bind(list_id)
        .fetch_one(pool)
        .await?;
    let todos: Vec<Todo> = sqlx::query_as(
        "SELECT * FROM todos WHERE list_id = ?1 ORDER BY position ASC, id ASC",
    )
    .bind(list_id)
    .fetch_all(pool)
    .await?;

    let mut out = String::new();
    render_list_section(pool, &list, &todos, &mut out).await?;

    let today = today_local(pool).await?;
    let _ = writeln!(out, "\n---\nExported by todo · {}", today);
    Ok(out)
}

/// Render a date range to Markdown with a TOC.
/// `from` and `to` are inclusive ISO dates (YYYY-MM-DD) or None for unbounded.
pub async fn render_range(
    pool: &SqlitePool,
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<String> {
    let lists: Vec<List> = sqlx::query_as(
        "SELECT * FROM lists
          WHERE archived = 0
            AND (?1 IS NULL OR date >= ?1)
            AND (?2 IS NULL OR date <= ?2)
          ORDER BY date DESC, id DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let mut out = String::new();
    let range_label = match (from, to) {
        (Some(f), Some(t)) => format!("{f} → {t}"),
        (Some(f), None) => format!("{f} → today"),
        (None, Some(t)) => format!("everything through {t}"),
        (None, None) => "everything".to_string(),
    };
    let _ = writeln!(out, "# Todos · {range_label}\n");

    if lists.is_empty() {
        out.push_str("_No lists in this range._\n");
    } else {
        for l in &lists {
            let _ = writeln!(
                out,
                "- [{} — {}](#{})",
                l.date,
                l.title,
                heading_slug(&format!("{} — {}", l.date, l.title))
            );
        }
        out.push('\n');

        for l in &lists {
            out.push_str("---\n\n");
            let todos: Vec<Todo> = sqlx::query_as(
                "SELECT * FROM todos WHERE list_id = ?1 ORDER BY position ASC, id ASC",
            )
            .bind(l.id)
            .fetch_all(pool)
            .await?;
            render_list_section(pool, l, &todos, &mut out).await?;
            out.push('\n');
        }
    }

    let today = today_local(pool).await?;
    let _ = writeln!(out, "---\nExported by todo · {}", today);
    Ok(out)
}

async fn render_list_section(
    pool: &SqlitePool,
    list: &List,
    todos: &[Todo],
    out: &mut String,
) -> AppResult<()> {
    let total = todos.len();
    let done = todos.iter().filter(|t| t.completed).count();
    let created = clock_part(&list.created_at);
    let updated = clock_part(&list.updated_at);

    let _ = writeln!(out, "# {} — {}\n", list.date, list.title);
    let _ = writeln!(
        out,
        "> {} of {} done · created {} · updated {}\n",
        done, total, created, updated
    );

    for todo in todos {
        let check = if todo.completed { 'x' } else { ' ' };
        let _ = writeln!(out, "- [{}] {}", check, todo.text);
        if let Some(notes) = &todo.notes {
            if !notes.trim().is_empty() {
                for line in notes.lines() {
                    let _ = writeln!(out, "  Notes: {}", line);
                }
            }
        }
        let tags: Vec<Tag> = sqlx::query_as(
            "SELECT t.* FROM tags t
               JOIN todo_tags tt ON tt.tag_id = t.id
              WHERE tt.todo_id = ?1
              ORDER BY t.name ASC",
        )
        .bind(todo.id)
        .fetch_all(pool)
        .await?;
        if !tags.is_empty() {
            let tag_str = tags
                .iter()
                .map(|t| format!("#{}", t.name))
                .collect::<Vec<_>>()
                .join(" ");
            let _ = writeln!(out, "  Tags: {}", tag_str);
        }
    }
    Ok(())
}

async fn today_local(pool: &SqlitePool) -> AppResult<String> {
    Ok(sqlx::query_scalar("SELECT date('now', 'localtime')")
        .fetch_one(pool)
        .await?)
}

/// Pull HH:MM from a "YYYY-MM-DD HH:MM:SS" timestamp.
fn clock_part(ts: &str) -> &str {
    ts.get(11..16).unwrap_or("")
}

/// Slugify a heading the way GitHub-flavored Markdown does (approximately):
/// lowercase, spaces → dashes, drop most punctuation.
fn heading_slug(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        let lc = ch.to_ascii_lowercase();
        if lc.is_ascii_alphanumeric() {
            out.push(lc);
        } else if lc == ' ' || lc == '-' || lc == '_' {
            out.push('-');
        }
        // everything else (em-dash, punctuation, etc.) is dropped
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{lists, tags, todos};
    use crate::db::models::TodoPatch;
    use crate::db::test_pool;

    #[tokio::test]
    async fn empty_list_renders_header_and_footer() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "Empty day", "2026-05-10").await.unwrap();
        let md = render_list(&pool, l.id).await.unwrap();
        assert!(md.contains("# 2026-05-10 — Empty day"));
        assert!(md.contains("> 0 of 0 done"));
        assert!(md.contains("Exported by todo"));
    }

    #[tokio::test]
    async fn list_renders_completed_and_pending() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "Monday", "2026-05-10").await.unwrap();
        let a = todos::create(&pool, l.id, "Do laundry").await.unwrap();
        todos::create(&pool, l.id, "Walk dog").await.unwrap();
        todos::update(
            &pool,
            a.id,
            &TodoPatch {
                completed: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let md = render_list(&pool, l.id).await.unwrap();
        assert!(md.contains("> 1 of 2 done"));
        assert!(md.contains("- [x] Do laundry"));
        assert!(md.contains("- [ ] Walk dog"));
    }

    #[tokio::test]
    async fn list_renders_notes_and_tags() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "Mon", "2026-05-10").await.unwrap();
        let t = todos::create(&pool, l.id, "Groceries").await.unwrap();
        todos::update(
            &pool,
            t.id,
            &TodoPatch {
                notes: Some("milk, bread".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        tags::add_to_todo(&pool, t.id, "home").await.unwrap();
        tags::add_to_todo(&pool, t.id, "errand").await.unwrap();

        let md = render_list(&pool, l.id).await.unwrap();
        assert!(md.contains("  Notes: milk, bread"));
        // tags are alphabetized by name
        assert!(md.contains("  Tags: #errand #home"));
    }

    #[tokio::test]
    async fn range_renders_toc_and_sections() {
        let pool = test_pool().await;
        let a = lists::create(&pool, "Mon", "2026-05-10").await.unwrap();
        let b = lists::create(&pool, "Sun", "2026-05-09").await.unwrap();
        todos::create(&pool, a.id, "alpha").await.unwrap();
        todos::create(&pool, b.id, "beta").await.unwrap();

        let md = render_range(&pool, Some("2026-05-09"), Some("2026-05-10"))
            .await
            .unwrap();

        assert!(md.starts_with("# Todos · 2026-05-09 → 2026-05-10"));
        // TOC entries
        assert!(md.contains("- [2026-05-10 — Mon]"));
        assert!(md.contains("- [2026-05-09 — Sun]"));
        // Each section appears
        assert!(md.contains("# 2026-05-10 — Mon"));
        assert!(md.contains("# 2026-05-09 — Sun"));
        // Contents
        assert!(md.contains("- [ ] alpha"));
        assert!(md.contains("- [ ] beta"));
    }

    #[tokio::test]
    async fn range_excludes_archived() {
        let pool = test_pool().await;
        let a = lists::create(&pool, "keep", "2026-05-10").await.unwrap();
        let b = lists::create(&pool, "hide", "2026-05-09").await.unwrap();
        lists::set_archived(&pool, b.id, true).await.unwrap();

        let md = render_range(&pool, None, None).await.unwrap();
        assert!(md.contains("# 2026-05-10 — keep"));
        assert!(!md.contains("# 2026-05-09 — hide"));
    }

    #[test]
    fn slug_matches_gfm_style() {
        // em-dash drops, surrounding spaces become dashes → double dash. Matches §7.
        assert_eq!(
            heading_slug("2026-05-10 — Monday plan"),
            "2026-05-10--monday-plan"
        );
        assert_eq!(heading_slug("Hello, World!"), "hello-world");
    }
}
