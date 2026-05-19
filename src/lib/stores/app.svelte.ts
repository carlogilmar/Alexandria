import { confirm, save } from "@tauri-apps/plugin-dialog";
import {
  listToday,
  listAll,
  listById,
  listTodos,
  createList,
  renameList as renameListIpc,
  archiveList,
  setListPinned,
  createTodo,
  toggleTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
  exportListMd,
  exportRangeMd,
  saveTextFile,
  searchTodos,
  getStats,
  getDailyStats,
  tagsForTodo,
  listTags,
  addTagToTodo,
  removeTagFromTodo,
  listWorkflows,
  workflowById,
  createWorkflow as createWorkflowIpc,
  renameWorkflow as renameWorkflowIpc,
  updateWorkflowDescription,
  deleteWorkflow as deleteWorkflowIpc,
  setWorkflowPinned,
  listWorkflowSteps,
  createWorkflowStep,
  updateWorkflowStep,
  deleteWorkflowStep,
  reorderWorkflowSteps,
  listAllTodos,
  listNotes,
  listNotesForDate,
  noteById,
  createNote as createNoteIpc,
  renameNote as renameNoteIpc,
  updateNoteBody,
  deleteNote as deleteNoteIpc,
  setNotePinned,
  listArticles,
  articleById,
  createArticle as createArticleIpc,
  renameArticle as renameArticleIpc,
  updateArticleBody,
  deleteArticle as deleteArticleIpc,
  setArticlePinned,
  getIndexDoc,
  updateIndexDoc,
  type Article,
  type ArticleSummary,
  type DayStats,
  type IndexDoc,
  type List,
  type ListSummary,
  type Note,
  type NoteSummary,
  type Stats,
  type Tag,
  type Todo,
  type TodoHit,
  type Workflow,
  type WorkflowStep,
  type WorkflowSummary,
} from "$lib/ipc";

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultListTitleForDate(dateIso: string): string {
  if (dateIso === todayIso()) return "ToDo's of today";
  const pretty = new Date(dateIso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return `ToDo's of ${pretty}`;
}

function safeFilename(s: string): string {
  return s.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function firstOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  return d.toLocaleDateString("en-CA");
}

class AppStore {
  view = $state<"home" | "list" | "workflow" | "note" | "index" | "article">(
    "home",
  );
  lists = $state<ListSummary[]>([]);
  selected = $state<List | null>(null);
  todos = $state<Todo[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);
  flash = $state<string | null>(null);
  helpOpen = $state(false);

  workflows = $state<WorkflowSummary[]>([]);
  selectedWorkflow = $state<Workflow | null>(null);
  workflowSteps = $state<WorkflowStep[]>([]);

  notes = $state<NoteSummary[]>([]);
  selectedNote = $state<Note | null>(null);

  articles = $state<ArticleSummary[]>([]);
  selectedArticle = $state<Article | null>(null);

  allTodos = $state<TodoHit[]>([]);

  indexDoc = $state<IndexDoc>({ body: "", updatedAt: "" });

  // When the home page is shown, this is the date pre-selected in the
  // day-detail panel. Null means "don't pre-select" (older behavior).
  homeFocusedDate = $state<string | null>(null);

  searchQuery = $state("");
  searchResults = $state<TodoHit[]>([]);
  stats = $state<Stats>({ totalLists: 0, totalTodos: 0, streak: 0 });
  dailyStats = $state<DayStats[]>([]);

  selectedTodoId = $state<number | null>(null);
  selectedTodoTags = $state<Tag[]>([]);
  allTags = $state<Tag[]>([]);

  private flashToken = 0;
  setFlash(msg: string, ms = 2000) {
    this.flash = msg;
    const token = ++this.flashToken;
    setTimeout(() => {
      if (this.flashToken === token) this.flash = null;
    }, ms);
  }

  selectedTodo(): Todo | null {
    if (this.selectedTodoId === null) return null;
    return this.todos.find((t) => t.id === this.selectedTodoId) ?? null;
  }

  async init() {
    this.loading = true;
    this.error = null;
    try {
      // Touch today's list so it exists in the sidebar, but the welcome
      // page is what the user sees on app launch.
      await listToday();
      this.lists = await listAll();
      this.stats = await getStats();
      this.dailyStats = await getDailyStats(null, null);
      this.allTags = await listTags();
      this.workflows = await listWorkflows();
      this.notes = await listNotes();
      this.articles = await listArticles();
      this.allTodos = await listAllTodos();
      this.indexDoc = await getIndexDoc();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  // ---- Workflows ----

  async refreshWorkflows() {
    this.workflows = await listWorkflows();
  }

  async selectWorkflow(id: number) {
    try {
      this.view = "workflow";
      this.selected = null;
      this.selectedTodoId = null;
      this.selectedTodoTags = [];
      this.selectedNote = null;
      this.selectedArticle = null;
      this.selectedWorkflow = await workflowById(id);
      this.workflowSteps = await listWorkflowSteps(id);
    } catch (e) {
      this.error = String(e);
    }
  }

  async newWorkflow(title = "New workflow") {
    const created = await createWorkflowIpc(title);
    await this.refreshWorkflows();
    await this.selectWorkflow(created.id);
  }

  async renameSelectedWorkflow(title: string) {
    if (!this.selectedWorkflow) return;
    const updated = await renameWorkflowIpc(this.selectedWorkflow.id, title);
    this.selectedWorkflow = updated;
    await this.refreshWorkflows();
  }

  async updateSelectedDescription(description: string) {
    if (!this.selectedWorkflow) return;
    const trimmed = description.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    if ((this.selectedWorkflow.description ?? null) === next) return;
    const updated = await updateWorkflowDescription(
      this.selectedWorkflow.id,
      next,
    );
    this.selectedWorkflow = updated;
  }

  async deleteSelectedWorkflow() {
    if (!this.selectedWorkflow) return;
    const ok = await confirm(
      `"${this.selectedWorkflow.title}" and all its steps will be permanently removed.`,
      { title: "Delete this workflow?", kind: "warning" },
    );
    if (!ok) return;
    await deleteWorkflowIpc(this.selectedWorkflow.id);
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.view = "home";
    await this.refreshWorkflows();
    this.setFlash("Workflow deleted");
  }

  async addWorkflowStep(text: string) {
    if (!this.selectedWorkflow) return;
    const created = await createWorkflowStep(this.selectedWorkflow.id, text, null);
    this.workflowSteps = [...this.workflowSteps, created];
    await this.refreshWorkflows();
  }

  async editWorkflowStep(id: number, text: string) {
    const updated = await updateWorkflowStep(id, text);
    this.workflowSteps = this.workflowSteps.map((s) =>
      s.id === updated.id ? updated : s,
    );
  }

  async removeWorkflowStep(id: number) {
    await deleteWorkflowStep(id);
    this.workflowSteps = this.workflowSteps.filter((s) => s.id !== id);
    await this.refreshWorkflows();
  }

  reorderWorkflowStepsLocal(orderedIds: number[]) {
    const byId = new Map(this.workflowSteps.map((s) => [s.id, s] as const));
    this.workflowSteps = orderedIds
      .map((id) => byId.get(id))
      .filter((s): s is WorkflowStep => s !== undefined);
  }

  async commitWorkflowReorder() {
    if (!this.selectedWorkflow) return;
    await reorderWorkflowSteps(
      this.selectedWorkflow.id,
      null,
      this.workflowSteps.filter((s) => s.parentStepId === null).map((s) => s.id),
    );
  }

  async goHome(focusToday = false) {
    this.view = "home";
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    if (focusToday) this.homeFocusedDate = todayIso();
    // Defensive: refresh stats + daily grid so the welcome page always
    // reflects the latest state, even if some mutation slipped past.
    try {
      this.stats = await getStats();
      this.dailyStats = await getDailyStats(null, null);
      this.lists = await listAll();
      this.notes = await listNotes();
      this.articles = await listArticles();
      this.allTodos = await listAllTodos();
      this.workflows = await listWorkflows();
    } catch (e) {
      this.error = String(e);
    }
  }

  // ---- Notes ----

  async refreshNotes() {
    this.notes = await listNotes();
  }

  async selectNote(id: number) {
    try {
      this.view = "note";
      this.selected = null;
      this.todos = [];
      this.selectedTodoId = null;
      this.selectedTodoTags = [];
      this.selectedWorkflow = null;
      this.workflowSteps = [];
      this.selectedArticle = null;
      this.selectedNote = await noteById(id);
    } catch (e) {
      this.error = String(e);
    }
  }

  async newNote(date?: string, title?: string) {
    const targetDate = date ?? todayIso();
    const finalTitle = title ?? `Note — ${defaultListTitleForDate(targetDate)}`;
    const created = await createNoteIpc(finalTitle, targetDate);
    await this.refreshNotes();
    await this.selectNote(created.id);
  }

  async renameSelectedNote(title: string) {
    if (!this.selectedNote) return;
    const updated = await renameNoteIpc(this.selectedNote.id, title);
    this.selectedNote = updated;
    await this.refreshNotes();
  }

  async updateSelectedNoteBody(body: string) {
    if (!this.selectedNote) return;
    if (body === this.selectedNote.body) return;
    const updated = await updateNoteBody(this.selectedNote.id, body);
    this.selectedNote = updated;
    await this.refreshNotes();
  }

  async deleteSelectedNote() {
    if (!this.selectedNote) return;
    const ok = await confirm(
      `"${this.selectedNote.title}" will be permanently removed.`,
      { title: "Delete this note?", kind: "warning" },
    );
    if (!ok) return;
    await deleteNoteIpc(this.selectedNote.id);
    this.selectedNote = null;
    this.view = "home";
    await this.refreshNotes();
    this.setFlash("Note deleted");
  }

  // ---- Index doc ----

  async openIndex() {
    this.view = "index";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    try {
      this.indexDoc = await getIndexDoc();
    } catch (e) {
      this.error = String(e);
    }
  }

  async saveIndex(body: string) {
    if (body === this.indexDoc.body) return;
    this.indexDoc = await updateIndexDoc(body);
  }

  // ---- Articles ----

  async refreshArticles() {
    this.articles = await listArticles();
  }

  async selectArticle(id: number) {
    try {
      this.view = "article";
      this.selected = null;
      this.todos = [];
      this.selectedTodoId = null;
      this.selectedTodoTags = [];
      this.selectedWorkflow = null;
      this.workflowSteps = [];
      this.selectedNote = null;
      this.selectedArticle = await articleById(id);
    } catch (e) {
      this.error = String(e);
    }
  }

  async newArticle(title = "New article") {
    const created = await createArticleIpc(title);
    await this.refreshArticles();
    await this.selectArticle(created.id);
  }

  async renameSelectedArticle(title: string) {
    if (!this.selectedArticle) return;
    const updated = await renameArticleIpc(this.selectedArticle.id, title);
    this.selectedArticle = updated;
    await this.refreshArticles();
  }

  async updateSelectedArticleBody(body: string) {
    if (!this.selectedArticle) return;
    if (body === this.selectedArticle.body) return;
    const updated = await updateArticleBody(this.selectedArticle.id, body);
    this.selectedArticle = updated;
    await this.refreshArticles();
  }

  async deleteSelectedArticle() {
    if (!this.selectedArticle) return;
    const ok = await confirm(
      `"${this.selectedArticle.title}" will be permanently removed.`,
      { title: "Delete this article?", kind: "warning" },
    );
    if (!ok) return;
    await deleteArticleIpc(this.selectedArticle.id);
    this.selectedArticle = null;
    this.view = "home";
    await this.refreshArticles();
    this.setFlash("Article deleted");
  }

  async toggleSelectedArticlePin() {
    if (!this.selectedArticle) return;
    const next = !this.selectedArticle.pinned;
    this.selectedArticle = await setArticlePinned(
      this.selectedArticle.id,
      next,
    );
    await this.refreshArticles();
    this.setFlash(next ? "Pinned" : "Unpinned");
  }

  // ---- Pin toggles (shared) ----

  async toggleSelectedNotePin() {
    if (!this.selectedNote) return;
    const next = !this.selectedNote.pinned;
    this.selectedNote = await setNotePinned(this.selectedNote.id, next);
    await this.refreshNotes();
    this.setFlash(next ? "Pinned" : "Unpinned");
  }

  async toggleSelectedWorkflowPin() {
    if (!this.selectedWorkflow) return;
    const next = !this.selectedWorkflow.pinned;
    this.selectedWorkflow = await setWorkflowPinned(
      this.selectedWorkflow.id,
      next,
    );
    await this.refreshWorkflows();
    this.setFlash(next ? "Pinned" : "Unpinned");
  }

  async toggleSelectedListPin() {
    if (!this.selected) return;
    const next = !this.selected.pinned;
    this.selected = await setListPinned(this.selected.id, next);
    await this.refreshLists();
    this.setFlash(next ? "Pinned" : "Unpinned");
  }

  async select(id: number) {
    this.view = "list";
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    if (this.selected?.id === id) return;
    try {
      this.selected = await listById(id);
      this.todos = await listTodos(id);
      this.selectedTodoId = null;
      this.selectedTodoTags = [];
    } catch (e) {
      this.error = String(e);
    }
  }

  async refreshLists() {
    this.lists = await listAll();
    this.stats = await getStats();
    this.dailyStats = await getDailyStats(null, null);
  }

  // ---- Search ----

  async runSearch(query: string, completed: boolean | null = null) {
    this.searchQuery = query;
    if (!query.trim()) {
      this.searchResults = [];
      return;
    }
    this.searchResults = await searchTodos(query, completed);
  }

  clearSearch() {
    this.searchQuery = "";
    this.searchResults = [];
  }

  async goToHit(hit: TodoHit) {
    await this.select(hit.listId);
    this.selectedTodoId = hit.id;
    await this.refreshSelectedTags();
    this.clearSearch();
  }

  // ---- Inspector (selected todo) ----

  async selectTodo(id: number | null) {
    this.selectedTodoId = id;
    if (id === null) {
      this.selectedTodoTags = [];
    } else {
      await this.refreshSelectedTags();
    }
  }

  async refreshSelectedTags() {
    if (this.selectedTodoId === null) {
      this.selectedTodoTags = [];
      return;
    }
    this.selectedTodoTags = await tagsForTodo(this.selectedTodoId);
  }

  async updateSelectedNotes(notes: string) {
    if (this.selectedTodoId === null) return;
    const updated = await updateTodo(this.selectedTodoId, { notes });
    this.todos = this.todos.map((t) => (t.id === updated.id ? updated : t));
  }

  async updateSelectedText(text: string) {
    if (this.selectedTodoId === null) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const updated = await updateTodo(this.selectedTodoId, { text: trimmed });
    this.todos = this.todos.map((t) => (t.id === updated.id ? updated : t));
  }

  async addTagToSelected(name: string) {
    if (this.selectedTodoId === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await addTagToTodo(this.selectedTodoId, trimmed);
    await this.refreshSelectedTags();
    // Refresh allTags so the autocomplete includes the newly-created tag.
    this.allTags = await listTags();
  }

  async removeTagFromSelected(tagId: number) {
    if (this.selectedTodoId === null) return;
    await removeTagFromTodo(this.selectedTodoId, tagId);
    await this.refreshSelectedTags();
  }

  async newList(title?: string, date?: string) {
    const targetDate = date ?? todayIso();
    const finalTitle = title ?? defaultListTitleForDate(targetDate);
    const created = await createList(finalTitle, targetDate);
    await this.refreshLists();
    await this.select(created.id);
  }

  async selectToday() {
    const today = await listToday();
    await this.select(today.id);
  }

  async renameSelected(title: string) {
    if (!this.selected) return;
    const updated = await renameListIpc(this.selected.id, title);
    this.selected = updated;
    await this.refreshLists();
  }

  async deleteSelected() {
    if (!this.selected) return;
    const ok = await confirm(
      `"${this.selected.title}" will be removed from the sidebar. (You can re-add an empty list for the same day with ⌘N.)`,
      { title: "Delete this list?", kind: "warning" },
    );
    if (!ok) return;
    const archivedId = this.selected.id;
    await archiveList(archivedId);
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    // Fall back to today's list (re-creates it if the user just deleted it).
    const today = await listToday();
    this.selected = today;
    this.todos = await listTodos(today.id);
    await this.refreshLists();
    this.setFlash("List deleted");
  }

  async addTodo(text: string) {
    if (!this.selected) return;
    const created = await createTodo(this.selected.id, text);
    this.todos = [...this.todos, created];
    await this.refreshLists();
  }

  async toggle(todo: Todo) {
    const updated = await toggleTodo(todo.id);
    this.todos = this.todos.map((t) => (t.id === updated.id ? updated : t));
    await this.refreshLists();
  }

  async editTodo(todo: Todo, text: string) {
    const updated = await updateTodo(todo.id, { text });
    this.todos = this.todos.map((t) => (t.id === updated.id ? updated : t));
  }

  async removeTodo(todo: Todo) {
    await deleteTodo(todo.id);
    this.todos = this.todos.filter((t) => t.id !== todo.id);
    await this.refreshLists();
  }

  // Optimistic local reorder during dragover (no IPC yet).
  reorderLocal(orderedIds: number[]) {
    const byId = new Map(this.todos.map((t) => [t.id, t] as const));
    this.todos = orderedIds
      .map((id) => byId.get(id))
      .filter((t): t is Todo => t !== undefined);
  }

  // Commit the current todo order to the server.
  async commitReorder() {
    if (!this.selected) return;
    await reorderTodos(
      this.selected.id,
      this.todos.map((t) => t.id),
    );
  }

  // ---- Export ----

  async copyCurrent() {
    if (!this.selected) return;
    const md = await exportListMd(this.selected.id);
    await navigator.clipboard.writeText(md);
    this.setFlash("Copied to clipboard");
  }

  async saveCurrent() {
    if (!this.selected) return;
    const md = await exportListMd(this.selected.id);
    const name = `${this.selected.date}_${safeFilename(this.selected.title)}.md`;
    const path = await save({
      defaultPath: name,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    await saveTextFile(path, md);
    this.setFlash("Saved");
  }

  async saveRange(
    from: string | null,
    to: string | null,
    suggestedName: string,
  ) {
    const md = await exportRangeMd(from, to);
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    await saveTextFile(path, md);
    this.setFlash("Saved");
  }

  async saveThisWeek() {
    const today = daysAgoIso(0);
    const from = daysAgoIso(6);
    await this.saveRange(from, today, `todos_week_${today}.md`);
  }

  async saveThisMonth() {
    const today = daysAgoIso(0);
    const from = firstOfMonthIso();
    await this.saveRange(from, today, `todos_month_${today}.md`);
  }

  async saveEverything() {
    const today = daysAgoIso(0);
    await this.saveRange(null, null, `todos_all_${today}.md`);
  }
}

export const app = new AppStore();
