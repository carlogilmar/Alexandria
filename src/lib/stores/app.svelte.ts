import { confirm, save } from "@tauri-apps/plugin-dialog";
import {
  listToday,
  listAll,
  listById,
  listTodos,
  createList,
  renameList as renameListIpc,
  archiveList,
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
  deleteWorkflow as deleteWorkflowIpc,
  listWorkflowSteps,
  createWorkflowStep,
  updateWorkflowStep,
  deleteWorkflowStep,
  reorderWorkflowSteps,
  type DayStats,
  type List,
  type ListSummary,
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
  view = $state<"home" | "list" | "workflow">("home");
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

  async goHome() {
    this.view = "home";
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    // Defensive: refresh stats + daily grid so the welcome page always
    // reflects the latest state, even if some mutation slipped past.
    try {
      this.stats = await getStats();
      this.dailyStats = await getDailyStats(null, null);
    } catch (e) {
      this.error = String(e);
    }
  }

  async select(id: number) {
    this.view = "list";
    this.selectedWorkflow = null;
    this.workflowSteps = [];
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

  async newList(title = "New list", date?: string) {
    const created = await createList(title, date ?? todayIso());
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
