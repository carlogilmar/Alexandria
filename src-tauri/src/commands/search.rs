use crate::commands::AppState;
use crate::db::models::{DayStats, Stats, TodoHit, WeeklyActivity};
use crate::error::AppResult;
use sqlx::SqlitePool;
use tauri::State;

/// LIKE wildcards `%` `_` and the escape char `\` need escaping in user input.
fn escape_like(q: &str) -> String {
    q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

pub(crate) async fn search(
    pool: &SqlitePool,
    query: &str,
    completed: Option<bool>,
) -> AppResult<Vec<TodoHit>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    let pattern = format!("%{}%", escape_like(trimmed));
    sqlx::query_as::<_, TodoHit>(
        "SELECT t.id, t.list_id, l.title AS list_title, l.date AS list_date,
                t.text, t.completed
           FROM todos t
           JOIN lists l ON l.id = t.list_id
          WHERE (t.text LIKE ?1 ESCAPE '\\' OR COALESCE(t.notes, '') LIKE ?1 ESCAPE '\\')
            AND (?2 IS NULL OR t.completed = ?2)
            AND l.archived = 0
          ORDER BY l.date DESC, t.position ASC
          LIMIT 100",
    )
    .bind(pattern)
    .bind(completed.map(|b| b as i64))
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn all_todos(pool: &SqlitePool) -> AppResult<Vec<TodoHit>> {
    sqlx::query_as::<_, TodoHit>(
        "SELECT t.id, t.list_id, l.title AS list_title, l.date AS list_date,
                t.text, t.completed
           FROM todos t
           JOIN lists l ON l.id = t.list_id
          WHERE l.archived = 0
          ORDER BY l.date DESC, t.position ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn stats(pool: &SqlitePool) -> AppResult<Stats> {
    let total_lists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM lists WHERE archived = 0 AND is_backlog = 0")
            .fetch_one(pool)
            .await?;
    let total_todos: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM todos t
           JOIN lists l ON l.id = t.list_id
          WHERE l.archived = 0 AND l.is_backlog = 0",
    )
    .fetch_one(pool)
    .await?;
    let streak: i64 = sqlx::query_scalar(
        r#"
        WITH RECURSIVE
          completion_days(d) AS (
            SELECT DISTINCT l.date
              FROM lists l
              JOIN todos t ON t.list_id = l.id
             WHERE t.completed = 1 AND l.archived = 0 AND l.is_backlog = 0
          ),
          seed(d) AS (
            SELECT d FROM completion_days
             WHERE d = date('now', 'localtime')
                OR d = date('now', 'localtime', '-1 day')
             ORDER BY d DESC
             LIMIT 1
          ),
          walk(d, cnt) AS (
            SELECT d, 1 FROM seed
            UNION ALL
            SELECT date(w.d, '-1 day'), w.cnt + 1
              FROM walk w
             WHERE EXISTS (
               SELECT 1 FROM completion_days c WHERE c.d = date(w.d, '-1 day')
             )
          )
        SELECT COALESCE(MAX(cnt), 0) FROM walk
        "#,
    )
    .fetch_one(pool)
    .await?;
    Ok(Stats {
        total_lists,
        total_todos,
        streak,
    })
}

pub(crate) async fn daily_stats(
    pool: &SqlitePool,
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<Vec<DayStats>> {
    sqlx::query_as::<_, DayStats>(
        "SELECT l.date,
                COUNT(t.id) AS total,
                COALESCE(SUM(t.completed), 0) AS done
           FROM lists l
           LEFT JOIN todos t ON t.list_id = l.id
          WHERE l.archived = 0 AND l.is_backlog = 0
            AND (?1 IS NULL OR l.date >= ?1)
            AND (?2 IS NULL OR l.date <= ?2)
          GROUP BY l.date
          ORDER BY l.date ASC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

/// Per-week counts of created entities across notes / articles / workflows /
/// lists. The result includes one row for every week between `from` and
/// `to` inclusive, even if every count is zero — the UI grid needs a cell
/// for each week. ISO week (Mon–Sun) via strftime('%Y-%W').
pub(crate) async fn weekly_activity(
    pool: &SqlitePool,
    from: &str,
    to: &str,
) -> AppResult<Vec<WeeklyActivity>> {
    // SQLite's strftime('%W') is week-of-year starting Sunday with weeks
    // before the first Sunday counted as week 0 — close enough to ISO for
    // the per-week binning we want here. We compute each week's Monday
    // anchor in the application layer by snapping the bucket key to a
    // calendar date.
    //
    // The CTE generates every Monday between `from` and `to` (inclusive),
    // then LEFT JOINs counts per kind. Empty weeks become rows of zeros.
    sqlx::query_as::<_, WeeklyActivity>(
        r#"
        WITH RECURSIVE weeks(week_start) AS (
            -- Snap `from` back to its Monday.
            SELECT date(?1, 'weekday 1', '-7 days')
            UNION ALL
            SELECT date(week_start, '+7 days') FROM weeks
             WHERE week_start < date(?2, 'weekday 1', '-7 days')
        )
        SELECT w.week_start                                          AS week_start,
               COALESCE((SELECT COUNT(*) FROM notes n
                          WHERE date(n.created_at) >= w.week_start
                            AND date(n.created_at) <  date(w.week_start, '+7 days')), 0) AS notes,
               COALESCE((SELECT COUNT(*) FROM articles a
                          WHERE date(a.created_at) >= w.week_start
                            AND date(a.created_at) <  date(w.week_start, '+7 days')), 0) AS articles,
               COALESCE((SELECT COUNT(*) FROM workflows wf
                          WHERE date(wf.created_at) >= w.week_start
                            AND date(wf.created_at) <  date(w.week_start, '+7 days')), 0) AS workflows,
               COALESCE((SELECT COUNT(*) FROM lists l
                          WHERE date(l.created_at) >= w.week_start
                            AND date(l.created_at) <  date(w.week_start, '+7 days')
                            AND l.archived = 0), 0)                                       AS lists
          FROM weeks w
         ORDER BY w.week_start ASC
        "#,
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

// ---------- Tauri command surface ----------

#[tauri::command]
pub async fn search_todos(
    state: State<'_, AppState>,
    query: String,
    completed: Option<bool>,
) -> AppResult<Vec<TodoHit>> {
    search(&state.pool, &query, completed).await
}

#[tauri::command]
pub async fn list_all_todos(state: State<'_, AppState>) -> AppResult<Vec<TodoHit>> {
    all_todos(&state.pool).await
}

#[tauri::command]
pub async fn get_stats(state: State<'_, AppState>) -> AppResult<Stats> {
    stats(&state.pool).await
}

#[tauri::command]
pub async fn get_daily_stats(
    state: State<'_, AppState>,
    from: Option<String>,
    to: Option<String>,
) -> AppResult<Vec<DayStats>> {
    daily_stats(&state.pool, from.as_deref(), to.as_deref()).await
}

#[tauri::command]
pub async fn get_weekly_activity(
    state: State<'_, AppState>,
    from: Option<String>,
    to: Option<String>,
) -> AppResult<Vec<WeeklyActivity>> {
    // Default range: 52 weeks ending today.
    let pool = &state.pool;
    let to: String = match to {
        Some(t) => t,
        None => sqlx::query_scalar("SELECT date('now', 'localtime')")
            .fetch_one(pool)
            .await?,
    };
    let from: String = match from {
        Some(f) => f,
        None => sqlx::query_scalar("SELECT date('now', 'localtime', '-52 weeks')")
            .fetch_one(pool)
            .await?,
    };
    weekly_activity(pool, &from, &to).await
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{lists, todos};
    use crate::db::models::TodoPatch;
    use crate::db::test_pool;

    async fn relative_date(pool: &SqlitePool, modifier: &str) -> String {
        sqlx::query_scalar(&format!("SELECT date('now', 'localtime', '{}')", modifier))
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn search_matches_text() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "L", "2026-05-10").await.unwrap();
        todos::create(&pool, l.id, "Walk the dog").await.unwrap();
        todos::create(&pool, l.id, "Buy groceries").await.unwrap();

        let hits = search(&pool, "dog", None).await.unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].text, "Walk the dog");
    }

    #[tokio::test]
    async fn search_matches_notes() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "L", "2026-05-10").await.unwrap();
        let t = todos::create(&pool, l.id, "Errand").await.unwrap();
        todos::update(
            &pool,
            t.id,
            &TodoPatch {
                notes: Some("pick up dry cleaning".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let hits = search(&pool, "dry cleaning", None).await.unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, t.id);
    }

    #[tokio::test]
    async fn search_completed_filter() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "L", "2026-05-10").await.unwrap();
        let a = todos::create(&pool, l.id, "alpha").await.unwrap();
        todos::create(&pool, l.id, "alpha-2").await.unwrap();
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

        assert_eq!(search(&pool, "alpha", None).await.unwrap().len(), 2);
        assert_eq!(search(&pool, "alpha", Some(true)).await.unwrap().len(), 1);
        assert_eq!(search(&pool, "alpha", Some(false)).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn search_excludes_archived() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "L", "2026-05-10").await.unwrap();
        todos::create(&pool, l.id, "hidden").await.unwrap();
        lists::set_archived(&pool, l.id, true).await.unwrap();

        assert!(search(&pool, "hidden", None).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn search_escapes_like_wildcards() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "L", "2026-05-10").await.unwrap();
        todos::create(&pool, l.id, "100% done eventually").await.unwrap();
        todos::create(&pool, l.id, "not relevant").await.unwrap();

        // Literal "%" should match only the first todo, not everything.
        let hits = search(&pool, "100%", None).await.unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].text.contains("100%"));
    }

    #[tokio::test]
    async fn search_empty_query_returns_empty() {
        let pool = test_pool().await;
        let l = lists::create(&pool, "L", "2026-05-10").await.unwrap();
        todos::create(&pool, l.id, "x").await.unwrap();
        assert!(search(&pool, "  ", None).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn stats_counts_lists_and_todos() {
        let pool = test_pool().await;
        let l1 = lists::create(&pool, "A", "2026-05-10").await.unwrap();
        let l2 = lists::create(&pool, "B", "2026-05-09").await.unwrap();
        todos::create(&pool, l1.id, "a").await.unwrap();
        todos::create(&pool, l1.id, "b").await.unwrap();
        todos::create(&pool, l2.id, "c").await.unwrap();

        let s = stats(&pool).await.unwrap();
        assert_eq!(s.total_lists, 2);
        assert_eq!(s.total_todos, 3);
    }

    #[tokio::test]
    async fn stats_archived_lists_are_excluded() {
        let pool = test_pool().await;
        let live = lists::create(&pool, "live", "2026-05-10").await.unwrap();
        let gone = lists::create(&pool, "gone", "2026-05-09").await.unwrap();
        todos::create(&pool, live.id, "a").await.unwrap();
        todos::create(&pool, gone.id, "b").await.unwrap();
        lists::set_archived(&pool, gone.id, true).await.unwrap();

        let s = stats(&pool).await.unwrap();
        assert_eq!(s.total_lists, 1);
        assert_eq!(s.total_todos, 1);
    }

    #[tokio::test]
    async fn stats_streak_zero_when_no_completions() {
        let pool = test_pool().await;
        let today = relative_date(&pool, "+0 days").await;
        let l = lists::create(&pool, "L", &today).await.unwrap();
        todos::create(&pool, l.id, "open").await.unwrap();
        assert_eq!(stats(&pool).await.unwrap().streak, 0);
    }

    #[tokio::test]
    async fn stats_streak_today_with_completion() {
        let pool = test_pool().await;
        let today = relative_date(&pool, "+0 days").await;
        let l = lists::create(&pool, "L", &today).await.unwrap();
        let t = todos::create(&pool, l.id, "x").await.unwrap();
        todos::update(
            &pool,
            t.id,
            &TodoPatch {
                completed: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(stats(&pool).await.unwrap().streak, 1);
    }

    #[tokio::test]
    async fn stats_streak_three_consecutive_days() {
        let pool = test_pool().await;
        for off in ["+0 days", "-1 days", "-2 days"] {
            let date = relative_date(&pool, off).await;
            let l = lists::create(&pool, "L", &date).await.unwrap();
            let t = todos::create(&pool, l.id, "x").await.unwrap();
            todos::update(
                &pool,
                t.id,
                &TodoPatch {
                    completed: Some(true),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        }
        assert_eq!(stats(&pool).await.unwrap().streak, 3);
    }

    #[tokio::test]
    async fn stats_streak_breaks_on_gap() {
        let pool = test_pool().await;
        // today, yesterday, gap at -2, then -3
        for off in ["+0 days", "-1 days", "-3 days"] {
            let date = relative_date(&pool, off).await;
            let l = lists::create(&pool, "L", &date).await.unwrap();
            let t = todos::create(&pool, l.id, "x").await.unwrap();
            todos::update(
                &pool,
                t.id,
                &TodoPatch {
                    completed: Some(true),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        }
        assert_eq!(stats(&pool).await.unwrap().streak, 2);
    }

    #[tokio::test]
    async fn daily_stats_aggregates_per_date() {
        let pool = test_pool().await;
        let a = lists::create(&pool, "morning", "2026-05-10").await.unwrap();
        let b = lists::create(&pool, "evening", "2026-05-10").await.unwrap();
        let c = lists::create(&pool, "weekend", "2026-05-09").await.unwrap();
        let t1 = todos::create(&pool, a.id, "x").await.unwrap();
        todos::create(&pool, a.id, "y").await.unwrap();
        todos::create(&pool, b.id, "z").await.unwrap();
        todos::create(&pool, c.id, "w").await.unwrap();
        todos::update(
            &pool,
            t1.id,
            &TodoPatch {
                completed: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let rows = daily_stats(&pool, None, None).await.unwrap();
        assert_eq!(rows.len(), 2);
        let row_09 = rows.iter().find(|r| r.date == "2026-05-09").unwrap();
        let row_10 = rows.iter().find(|r| r.date == "2026-05-10").unwrap();
        assert_eq!(row_09.total, 1);
        assert_eq!(row_09.done, 0);
        assert_eq!(row_10.total, 3); // 2 from morning + 1 from evening
        assert_eq!(row_10.done, 1);
    }

    #[tokio::test]
    async fn daily_stats_excludes_archived() {
        let pool = test_pool().await;
        let live = lists::create(&pool, "live", "2026-05-10").await.unwrap();
        let gone = lists::create(&pool, "gone", "2026-05-09").await.unwrap();
        todos::create(&pool, live.id, "a").await.unwrap();
        todos::create(&pool, gone.id, "b").await.unwrap();
        lists::set_archived(&pool, gone.id, true).await.unwrap();

        let rows = daily_stats(&pool, None, None).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, "2026-05-10");
    }

    #[tokio::test]
    async fn daily_stats_respects_range() {
        let pool = test_pool().await;
        lists::create(&pool, "early", "2026-04-30").await.unwrap();
        lists::create(&pool, "mid", "2026-05-05").await.unwrap();
        lists::create(&pool, "late", "2026-05-15").await.unwrap();
        let r = daily_stats(&pool, Some("2026-05-01"), Some("2026-05-10"))
            .await
            .unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].date, "2026-05-05");
    }

    #[tokio::test]
    async fn all_todos_returns_every_todo_excluding_archived() {
        let pool = test_pool().await;
        let live = lists::create(&pool, "live", "2026-05-10").await.unwrap();
        let gone = lists::create(&pool, "gone", "2026-05-09").await.unwrap();
        todos::create(&pool, live.id, "a").await.unwrap();
        todos::create(&pool, live.id, "b").await.unwrap();
        todos::create(&pool, gone.id, "hidden").await.unwrap();
        lists::set_archived(&pool, gone.id, true).await.unwrap();

        let rows = all_todos(&pool).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.text != "hidden"));
    }

    #[tokio::test]
    async fn stats_streak_starts_yesterday_if_today_empty() {
        let pool = test_pool().await;
        let yesterday = relative_date(&pool, "-1 days").await;
        let l = lists::create(&pool, "L", &yesterday).await.unwrap();
        let t = todos::create(&pool, l.id, "x").await.unwrap();
        todos::update(
            &pool,
            t.id,
            &TodoPatch {
                completed: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(stats(&pool).await.unwrap().streak, 1);
    }
}
