import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export type List = {
  id: number;
  title: string;
  date: string;
  archived: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListSummary = {
  id: number;
  title: string;
  date: string;
  archived: boolean;
  pinned: boolean;
  total: number;
  done: number;
};

export type Todo = {
  id: number;
  listId: number;
  text: string;
  notes: string | null;
  completed: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type TodoPatch = {
  text?: string;
  notes?: string;
  completed?: boolean;
};

export type Tag = {
  id: number;
  name: string;
};

export type TodoHit = {
  id: number;
  listId: number;
  listTitle: string;
  listDate: string;
  text: string;
  completed: boolean;
};

export type Stats = {
  totalLists: number;
  totalTodos: number;
  streak: number;
};

export type DayStats = {
  date: string; // YYYY-MM-DD
  total: number;
  done: number;
};

export type Workflow = {
  id: number;
  title: string;
  description: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSummary = {
  id: number;
  title: string;
  stepCount: number;
  pinned: boolean;
  archived: boolean;
};

export type WorkflowStep = {
  id: number;
  workflowId: number;
  parentStepId: number | null;
  text: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: number;
  title: string;
  date: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteSummary = {
  id: number;
  title: string;
  date: string;
  pinned: boolean;
  archived: boolean;
};

export type IndexDoc = {
  body: string;
  updatedAt: string;
};

export type Article = {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArticleSummary = {
  id: number;
  title: string;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
};

export type MapEntityKind = "note" | "article" | "workflow";
export type MapNodeKind = MapEntityKind | "text" | "comment" | "custom";

export type MapNode = {
  id: number;
  kind: MapNodeKind;
  entityId: number;
  x: number;
  y: number;
  content: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MapEdge = {
  id: number;
  sourceId: number;
  targetId: number;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MapState = {
  nodes: MapNode[];
  edges: MapEdge[];
};

export type FeedbackColumn =
  | "to_implement"
  | "in_definition"
  | "in_progress"
  | "done";

export type FeedbackBoard = {
  id: number;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackBoardSummary = {
  id: number;
  title: string;
  archived: boolean;
  cardCount: number;
  updatedAt: string;
};

export type FeedbackCard = {
  id: number;
  boardId: number;
  columnKind: FeedbackColumn;
  title: string;
  description: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackCardSummary = FeedbackCard & {
  commentCount: number;
};

export type FeedbackCardComment = {
  id: number;
  cardId: number;
  body: string;
  createdAt: string;
};

export type WeeklyActivity = {
  weekStart: string;
  notes: number;
  articles: number;
  workflows: number;
  lists: number;
};

// Lists
export const listToday = () => invoke<List>("list_today");
export const listById = (id: number) => invoke<List>("list_by_id", { id });
export const listAll = (opts?: {
  from?: string;
  to?: string;
  includeArchived?: boolean;
}) => invoke<ListSummary[]>("list_all", opts ?? {});
export const createList = (title: string, date: string) =>
  invoke<List>("create_list", { title, date });
export const renameList = (id: number, title: string) =>
  invoke<List>("rename_list", { id, title });
export const archiveList = (id: number) => invoke<List>("archive_list", { id });
export const restoreList = (id: number) => invoke<List>("restore_list", { id });
export const setListPinned = (id: number, pinned: boolean) =>
  invoke<List>("set_list_pinned", { id, pinned });

// Todos
export const listTodos = (listId: number) =>
  invoke<Todo[]>("list_todos", { listId });
export const createTodo = (listId: number, text: string) =>
  invoke<Todo>("create_todo", { listId, text });
export const updateTodo = (id: number, patch: TodoPatch) =>
  invoke<Todo>("update_todo", { id, patch });
export const toggleTodo = (id: number) => invoke<Todo>("toggle_todo", { id });
export const deleteTodo = (id: number) => invoke<void>("delete_todo", { id });
export const reorderTodos = (listId: number, orderedIds: number[]) =>
  invoke<void>("reorder_todos", { listId, orderedIds });

// Tags
export const listTags = () => invoke<Tag[]>("list_tags");
export const tagsForTodo = (todoId: number) =>
  invoke<Tag[]>("tags_for_todo", { todoId });
export const addTagToTodo = (todoId: number, name: string) =>
  invoke<Tag>("add_tag_to_todo", { todoId, name });
export const removeTagFromTodo = (todoId: number, tagId: number) =>
  invoke<void>("remove_tag_from_todo", { todoId, tagId });

// Search + stats
export const searchTodos = (query: string, completed: boolean | null) =>
  invoke<TodoHit[]>("search_todos", { query, completed });
export const listAllTodos = () => invoke<TodoHit[]>("list_all_todos");
export const getStats = () => invoke<Stats>("get_stats");
export const getDailyStats = (from: string | null, to: string | null) =>
  invoke<DayStats[]>("get_daily_stats", { from, to });

// Workflows
export const listWorkflows = () =>
  invoke<WorkflowSummary[]>("list_workflows");
export const workflowById = (id: number) =>
  invoke<Workflow>("workflow_by_id", { id });
export const createWorkflow = (title: string) =>
  invoke<Workflow>("create_workflow", { title });
export const renameWorkflow = (id: number, title: string) =>
  invoke<Workflow>("rename_workflow", { id, title });
export const updateWorkflowDescription = (
  id: number,
  description: string | null,
) =>
  invoke<Workflow>("update_workflow_description", { id, description });
export const deleteWorkflow = (id: number) =>
  invoke<void>("delete_workflow", { id });
export const setWorkflowPinned = (id: number, pinned: boolean) =>
  invoke<Workflow>("set_workflow_pinned", { id, pinned });
export const setWorkflowArchived = (id: number, archived: boolean) =>
  invoke<Workflow>("set_workflow_archived", { id, archived });
export const listWorkflowSteps = (workflowId: number) =>
  invoke<WorkflowStep[]>("list_workflow_steps", { workflowId });
export const createWorkflowStep = (
  workflowId: number,
  text: string,
  parentStepId: number | null = null,
) =>
  invoke<WorkflowStep>("create_workflow_step", {
    workflowId,
    text,
    parentStepId,
  });
export const updateWorkflowStep = (id: number, text: string) =>
  invoke<WorkflowStep>("update_workflow_step", { id, text });
export const deleteWorkflowStep = (id: number) =>
  invoke<void>("delete_workflow_step", { id });
export const reorderWorkflowSteps = (
  workflowId: number,
  parentStepId: number | null,
  orderedIds: number[],
) =>
  invoke<void>("reorder_workflow_steps", {
    workflowId,
    parentStepId,
    orderedIds,
  });

// Notes
export const listNotes = () => invoke<NoteSummary[]>("list_notes");
export const listNotesForDate = (date: string) =>
  invoke<NoteSummary[]>("list_notes_for_date", { date });
export const noteById = (id: number) => invoke<Note>("note_by_id", { id });
export const createNote = (title: string, date: string) =>
  invoke<Note>("create_note", { title, date });
export const renameNote = (id: number, title: string) =>
  invoke<Note>("rename_note", { id, title });
export const updateNoteBody = (id: number, body: string) =>
  invoke<Note>("update_note_body", { id, body });
export const deleteNote = (id: number) =>
  invoke<void>("delete_note", { id });
export const setNotePinned = (id: number, pinned: boolean) =>
  invoke<Note>("set_note_pinned", { id, pinned });
export const setNoteArchived = (id: number, archived: boolean) =>
  invoke<Note>("set_note_archived", { id, archived });

// Articles
export const listArticles = () => invoke<ArticleSummary[]>("list_articles");
export const articleById = (id: number) =>
  invoke<Article>("article_by_id", { id });
export const createArticle = (title: string) =>
  invoke<Article>("create_article", { title });
export const renameArticle = (id: number, title: string) =>
  invoke<Article>("rename_article", { id, title });
export const updateArticleBody = (id: number, body: string) =>
  invoke<Article>("update_article_body", { id, body });
export const deleteArticle = (id: number) =>
  invoke<void>("delete_article", { id });
export const setArticlePinned = (id: number, pinned: boolean) =>
  invoke<Article>("set_article_pinned", { id, pinned });
export const setArticleArchived = (id: number, archived: boolean) =>
  invoke<Article>("set_article_archived", { id, archived });

// Index doc
export const getIndexDoc = () => invoke<IndexDoc>("get_index_doc");
export const updateIndexDoc = (body: string) =>
  invoke<IndexDoc>("update_index_doc", { body });

// Master map
export const getMap = () => invoke<MapState>("get_map");
export const addMapNode = (
  kind: MapEntityKind,
  entityId: number,
  x: number,
  y: number,
) => invoke<MapNode>("add_map_node", { kind, entityId, x, y });
export const addMapText = (content: string, x: number, y: number) =>
  invoke<MapNode>("add_map_text", { content, x, y });
export const addMapComment = (content: string, x: number, y: number) =>
  invoke<MapNode>("add_map_comment", { content, x, y });
export const addMapCustom = (content: string, x: number, y: number) =>
  invoke<MapNode>("add_map_custom", { content, x, y });
export const updateMapNodeContent = (id: number, content: string) =>
  invoke<MapNode>("update_map_node_content", { id, content });
export const moveMapNode = (id: number, x: number, y: number) =>
  invoke<MapNode>("move_map_node", { id, x, y });
export const removeMapNode = (id: number) =>
  invoke<void>("remove_map_node", { id });
export const addMapEdge = (
  sourceId: number,
  targetId: number,
  label: string | null = null,
) => invoke<MapEdge>("add_map_edge", { sourceId, targetId, label });
export const updateMapEdgeLabel = (id: number, label: string | null) =>
  invoke<MapEdge>("update_map_edge_label", { id, label });
export const removeMapEdge = (id: number) =>
  invoke<void>("remove_map_edge", { id });

// Feedback kanban
export const listFeedbackBoards = (includeArchived = false) =>
  invoke<FeedbackBoardSummary[]>("list_feedback_boards", { includeArchived });
export const createFeedbackBoard = (title: string) =>
  invoke<FeedbackBoard>("create_feedback_board", { title });
export const renameFeedbackBoard = (id: number, title: string) =>
  invoke<FeedbackBoard>("rename_feedback_board", { id, title });
export const setFeedbackBoardArchived = (id: number, archived: boolean) =>
  invoke<FeedbackBoard>("set_feedback_board_archived", { id, archived });
export const deleteFeedbackBoard = (id: number) =>
  invoke<void>("delete_feedback_board", { id });

export const listFeedbackCards = (boardId: number) =>
  invoke<FeedbackCardSummary[]>("list_feedback_cards", { boardId });
export const createFeedbackCard = (
  boardId: number,
  columnKind: FeedbackColumn,
  title: string,
  description: string | null = null,
) =>
  invoke<FeedbackCard>("create_feedback_card", {
    boardId,
    columnKind,
    title,
    description,
  });
export const updateFeedbackCard = (
  id: number,
  title: string | null,
  description: string | null,
) => invoke<FeedbackCard>("update_feedback_card", { id, title, description });
export const moveFeedbackCard = (
  id: number,
  targetColumn: FeedbackColumn,
  targetPosition: number,
) =>
  invoke<FeedbackCard>("move_feedback_card", {
    id,
    targetColumn,
    targetPosition,
  });
export const deleteFeedbackCard = (id: number) =>
  invoke<void>("delete_feedback_card", { id });

export const listFeedbackCardComments = (cardId: number) =>
  invoke<FeedbackCardComment[]>("list_feedback_card_comments", { cardId });
export const addFeedbackCardComment = (cardId: number, body: string) =>
  invoke<FeedbackCardComment>("add_feedback_card_comment", { cardId, body });
export const deleteFeedbackCardComment = (id: number) =>
  invoke<void>("delete_feedback_card_comment", { id });

// Activity
export const getWeeklyActivity = (
  from: string | null = null,
  to: string | null = null,
) => invoke<WeeklyActivity[]>("get_weekly_activity", { from, to });

// Images
export async function saveImageFile(file: File): Promise<string> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const fromName = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
  const fromType = file.type.startsWith("image/") ? file.type.slice(6) : "";
  const extension = (fromName || fromType || "png").toLowerCase();
  const path = await invoke<string>("save_image", { bytes, extension });
  return convertFileSrc(path);
}

// Export
export const exportListMd = (id: number) =>
  invoke<string>("export_list_md", { id });
export const exportRangeMd = (from: string | null, to: string | null) =>
  invoke<string>("export_range_md", { from, to });
export const saveTextFile = (path: string, content: string) =>
  invoke<void>("save_text_file", { path, content });
