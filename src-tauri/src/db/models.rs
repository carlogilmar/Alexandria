use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct List {
    pub id: i64,
    pub title: String,
    pub date: String,
    pub archived: bool,
    pub pinned: bool,
    #[serde(default)]
    pub is_backlog: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ListSummary {
    pub id: i64,
    pub title: String,
    pub date: String,
    pub archived: bool,
    pub pinned: bool,
    pub total: i64,
    pub done: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: i64,
    pub list_id: i64,
    pub text: String,
    pub notes: Option<String>,
    pub completed: bool,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TodoPatch {
    pub text: Option<String>,
    pub notes: Option<String>,
    pub completed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TodoHit {
    pub id: i64,
    pub list_id: i64,
    pub list_title: String,
    pub list_date: String,
    pub text: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total_lists: i64,
    pub total_todos: i64,
    pub streak: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DayStats {
    pub date: String,
    pub total: i64,
    pub done: i64,
}

// Storyboards (Sprint 43): a sequence of pages, each a tiny canvas + a
// markdown note. Node/edge shape mirrors Blueprints but scoped to a page.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Storyboard {
    pub id: i64,
    pub title: String,
    pub pinned: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardSummary {
    pub id: i64,
    pub title: String,
    pub pinned: bool,
    pub archived: bool,
    pub page_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardPage {
    pub id: i64,
    pub storyboard_id: i64,
    pub position: i64,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardNode {
    pub id: i64,
    pub page_id: i64,
    pub kind: String,
    pub label: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardEdge {
    pub id: i64,
    pub page_id: i64,
    pub source_id: i64,
    pub target_id: i64,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// The full get-state payload: the storyboard + all its pages + every page's
// nodes and edges (the editor filters by the current page).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardState {
    pub storyboard: Storyboard,
    pub pages: Vec<StoryboardPage>,
    pub nodes: Vec<StoryboardNode>,
    pub edges: Vec<StoryboardEdge>,
}

// Camera check-in (Sprint 42): a webcam GIF snapped when a today's list is
// created. `path` is the absolute GIF file path; `list_id` may be null.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Checkin {
    pub id: i64,
    pub list_id: Option<i64>,
    pub path: String,
    pub created_at: String,
}

// Passwords vault (Sprint 41). `SecretMeta` is the safe listing shape — id +
// plaintext title only, never the password. `VaultStatus` drives the UI gate.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SecretMeta {
    pub id: i64,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

// Combined per-day activity for the contribution graph: completed todos +
// notes / articles / blueprints created that day.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub date: String,
    pub count: i64,
}

// Persisted sidebar pin order (Sprint 49). `PinKey` is the input shape the
// frontend sends (an ordered list); `PinOrder` is what we return.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PinOrder {
    pub kind: String,
    pub entity_id: i64,
    pub position: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinKey {
    pub kind: String,
    pub entity_id: i64,
}

// "The Mirror" (Sprint 46): a data-portrait of the whole corpus. Each
// artifact is a point with a type-native `mass` (the frontend log-normalises
// across all points for its orb radius); lists form the terrain.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorPoint {
    pub kind: String, // note | blueprint | board | storyboard
    pub id: i64,
    pub title: String,
    pub created_at: String,
    pub mass: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MirrorList {
    pub id: i64,
    pub date: String,
    pub tasks: i64,
    pub done: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorData {
    pub points: Vec<MirrorPoint>,
    pub lists: Vec<MirrorList>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub date: String,
    pub body: String,
    pub pinned: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: i64,
    pub title: String,
    pub date: String,
    pub pinned: bool,
    pub archived: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IndexDoc {
    pub body: String,
    pub updated_at: String,
}


#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Blueprint {
    pub id: i64,
    pub title: String,
    pub pinned: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintSummary {
    pub id: i64,
    pub title: String,
    pub pinned: bool,
    pub archived: bool,
    pub node_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintNode {
    pub id: i64,
    pub blueprint_id: i64,
    pub kind: String,
    pub title: String,
    pub description: String,
    pub color: Option<String>,
    pub content: Option<String>,
    pub image_url: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintEdge {
    pub id: i64,
    pub blueprint_id: i64,
    pub source_id: i64,
    pub target_id: i64,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintState {
    pub blueprint: Blueprint,
    pub nodes: Vec<BlueprintNode>,
    pub edges: Vec<BlueprintEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackBoard {
    pub id: i64,
    pub title: String,
    pub archived: bool,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackBoardSummary {
    pub id: i64,
    pub title: String,
    pub archived: bool,
    pub pinned: bool,
    pub card_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackColumn {
    pub id: i64,
    pub board_id: i64,
    pub name: String,
    pub position: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackCard {
    pub id: i64,
    pub board_id: i64,
    pub column_id: i64,
    pub title: String,
    pub description: String,
    pub color: Option<String>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackCardSummary {
    pub id: i64,
    pub board_id: i64,
    pub column_id: i64,
    pub title: String,
    pub description: String,
    pub color: Option<String>,
    pub position: i64,
    pub comment_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackCardComment {
    pub id: i64,
    pub card_id: i64,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyActivity {
    pub week_start: String,
    pub notes: i64,
    pub lists: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardCategory {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub position: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Flashcard {
    pub id: i64,
    pub title: String,
    pub category_id: Option<i64>,
    pub body: String,
    pub image_url: Option<String>,
    pub emoji: Option<String>,
    pub color: Option<String>,
    pub position: i64,
    pub pinned: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}
