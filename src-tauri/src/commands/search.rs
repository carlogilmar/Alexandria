use crate::commands::AppState;
use crate::db::models::{Stats, TodoHit};
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

pub(crate) async fn stats(pool: &SqlitePool) -> AppResult<Stats> {
    let total_lists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM lists WHERE archived = 0")
            .fetch_one(pool)
            .await?;
    let total_todos: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM todos t
           JOIN lists l ON l.id = t.list_id
          WHERE l.archived = 0",
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
             WHERE t.completed = 1 AND l.archived = 0
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
pub async fn get_stats(state: State<'_, AppState>) -> AppResult<Stats> {
    stats(&state.pool).await
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
