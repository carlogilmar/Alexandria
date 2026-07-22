import { confirm, save } from "@tauri-apps/plugin-dialog";
import {
  listToday,
  listAll,
  listById,
  listBacklog,
  listBacklogPending,
  listTodos,
  createList,
  moveTodo,
  renameList as renameListIpc,
  archiveList,
  restoreList,
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
  setNoteArchived,
  setWorkflowArchived,
  setArticleArchived,
  listArticles,
  articleById,
  createArticle as createArticleIpc,
  renameArticle as renameArticleIpc,
  updateArticleBody,
  deleteArticle as deleteArticleIpc,
  setArticlePinned,
  getMap,
  addMapNode as addMapNodeIpc,
  addMapText as addMapTextIpc,
  addMapComment as addMapCommentIpc,
  addMapCustom as addMapCustomIpc,
  addMapTitle as addMapTitleIpc,
  resizeMapNode as resizeMapNodeIpc,
  updateMapNodeContent as updateMapNodeContentIpc,
  moveMapNode as moveMapNodeIpc,
  removeMapNode as removeMapNodeIpc,
  addMapEdge as addMapEdgeIpc,
  updateMapEdgeLabel as updateMapEdgeLabelIpc,
  removeMapEdge as removeMapEdgeIpc,
  listBlueprints,
  createBlueprint as createBlueprintIpc,
  renameBlueprint as renameBlueprintIpc,
  setBlueprintPinned as setBlueprintPinnedIpc,
  setBlueprintArchived as setBlueprintArchivedIpc,
  deleteBlueprint as deleteBlueprintIpc,
  getBlueprint,
  addBlueprintCard as addBlueprintCardIpc,
  addBlueprintImageCard as addBlueprintImageCardIpc,
  addBlueprintFrame as addBlueprintFrameIpc,
  addBlueprintDecorative as addBlueprintDecorativeIpc,
  updateBlueprintCard as updateBlueprintCardIpc,
  setBlueprintCardColor as setBlueprintCardColorIpc,
  updateBlueprintNodeContent as updateBlueprintNodeContentIpc,
  moveBlueprintNode as moveBlueprintNodeIpc,
  resizeBlueprintNode as resizeBlueprintNodeIpc,
  removeBlueprintNode as removeBlueprintNodeIpc,
  addBlueprintEdge as addBlueprintEdgeIpc,
  updateBlueprintEdgeLabel as updateBlueprintEdgeLabelIpc,
  removeBlueprintEdge as removeBlueprintEdgeIpc,
  getIndexDoc,
  updateIndexDoc,
  listFeedbackBoards,
  createFeedbackBoard as createFeedbackBoardIpc,
  renameFeedbackBoard as renameFeedbackBoardIpc,
  setFeedbackBoardArchived as setFeedbackBoardArchivedIpc,
  setFeedbackBoardPinned as setFeedbackBoardPinnedIpc,
  deleteFeedbackBoard as deleteFeedbackBoardIpc,
  listFeedbackColumns,
  createFeedbackColumn as createFeedbackColumnIpc,
  renameFeedbackColumn as renameFeedbackColumnIpc,
  deleteFeedbackColumn as deleteFeedbackColumnIpc,
  listFeedbackCards,
  createFeedbackCard as createFeedbackCardIpc,
  updateFeedbackCard as updateFeedbackCardIpc,
  setFeedbackCardColor as setFeedbackCardColorIpc,
  moveFeedbackCard as moveFeedbackCardIpc,
  deleteFeedbackCard as deleteFeedbackCardIpc,
  listFeedbackCardComments,
  addFeedbackCardComment as addFeedbackCardCommentIpc,
  deleteFeedbackCardComment as deleteFeedbackCardCommentIpc,
  getWeeklyActivity,
  listFlashcards,
  listFlashcardCategories,
  flashcardById,
  createFlashcard as createFlashcardIpc,
  updateFlashcard as updateFlashcardIpc,
  setFlashcardCategory as setFlashcardCategoryIpc,
  setFlashcardColor as setFlashcardColorIpc,
  setFlashcardEmoji as setFlashcardEmojiIpc,
  setFlashcardImage as setFlashcardImageIpc,
  setFlashcardPinned as setFlashcardPinnedIpc,
  setFlashcardArchived as setFlashcardArchivedIpc,
  moveFlashcard as moveFlashcardIpc,
  deleteFlashcard as deleteFlashcardIpc,
  createFlashcardCategory as createFlashcardCategoryIpc,
  updateFlashcardCategory as updateFlashcardCategoryIpc,
  deleteFlashcardCategory as deleteFlashcardCategoryIpc,
  type Article,
  type ArticleSummary,
  type DayStats,
  type FeedbackBoardSummary,
  type FeedbackCardComment,
  type FeedbackCardSummary,
  type FeedbackColumn,
  type Flashcard,
  type FlashcardCategory,
  type IndexDoc,
  type List,
  type ListSummary,
  type MapEdge,
  type MapEntityKind,
  type MapNode,
  type Blueprint,
  type BlueprintSummary,
  type BlueprintNode,
  type BlueprintEdge,
  type Note,
  type NoteSummary,
  type Stats,
  type Tag,
  type Todo,
  type TodoHit,
  type WeeklyActivity,
  type Workflow,
  type WorkflowStep,
  type WorkflowSummary,
} from "$lib/ipc";
import { buildGraph, type GardenGraph } from "$lib/garden";

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const QUICK_ARTICLE_KEY = "quickArticleId";
function readQuickArticleId(): number | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(QUICK_ARTICLE_KEY);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
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

// A returnable location for the back button. Entity views carry their id.
type NavLoc =
  | { view: "home" }
  | { view: "list"; id: number }
  | { view: "note"; id: number }
  | { view: "article"; id: number }
  | { view: "workflow"; id: number }
  | { view: "feedback-board"; id: number }
  | { view: "blueprint"; id: number }
  | {
      view:
        | "index"
        | "garden"
        | "map"
        | "feedback"
        | "activity"
        | "flashdeck"
        | "blueprints";
    };

class AppStore {
  view = $state<
    | "home"
    | "list"
    | "workflow"
    | "note"
    | "index"
    | "article"
    | "garden"
    | "map"
    | "feedback"
    | "feedback-board"
    | "activity"
    | "flashdeck"
    | "blueprints"
    | "blueprint"
  >("home");
  // Back-navigation history — locations we can pop back to. $state so the
  // back button's enabled state stays reactive.
  navStack = $state<NavLoc[]>([]);
  private suppressNav = false;
  lists = $state<ListSummary[]>([]);
  selected = $state<List | null>(null);
  todos = $state<Todo[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);
  flash = $state<string | null>(null);
  helpOpen = $state(false);
  // "+ Add" (create-entity) modal — page-level so it isn't trapped in the
  // sidebar's `isolate` stacking context (which painted it under the view).
  addModalOpen = $state(false);
  // Global command palette (⌘K) + in-app formatting reference.
  paletteOpen = $state(false);
  formattingHelpOpen = $state(false);
  // Collapse the sidebar for distraction-free, full-width reading.
  sidebarCollapsed = $state(false);

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  workflows = $state<WorkflowSummary[]>([]);
  selectedWorkflow = $state<Workflow | null>(null);
  workflowSteps = $state<WorkflowStep[]>([]);

  notes = $state<NoteSummary[]>([]);
  selectedNote = $state<Note | null>(null);

  articles = $state<ArticleSummary[]>([]);
  selectedArticle = $state<Article | null>(null);
  // A single "quick access" article the user designates (e.g. a references
  // doc), openable via ⌘⇧A / a Stream Deck button. Persisted in localStorage.
  quickArticleId = $state<number | null>(readQuickArticleId());

  allTodos = $state<TodoHit[]>([]);

  indexDoc = $state<IndexDoc>({ body: "", updatedAt: "" });

  // Garden cache. Built lazily on openGarden(); rebuilt when stale or after
  // any mutation that might affect the graph.
  gardenGraph = $state<GardenGraph | null>(null);
  gardenLoading = $state(false);
  private gardenBuiltAt = 0;
  private static GARDEN_TTL_MS = 30_000;

  // Master map state.
  mapNodes = $state<MapNode[]>([]);
  mapEdges = $state<MapEdge[]>([]);
  mapLoaded = $state(false);
  mapLoading = $state(false);

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

  // Focus mode (Sprint 28): a full-screen aurora "screensaver" overlay that
  // shows today's list. Its todo state is independent of `this.todos` so
  // entering/exiting never disturbs whatever view is open behind the overlay.
  focusMode = $state(false);
  focusTodos = $state<Todo[]>([]);
  focusListId = $state<number | null>(null);
  focusListTitle = $state<string | null>(null);

  // Backlog (Sprint 29): a single durable list for unscheduled tasks. `backlogId`
  // is cached once resolved; `backlogPending` drives the sidebar badge.
  backlogId = $state<number | null>(null);
  backlogPending = $state(0);

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
      // Do NOT auto-create today's list — that would silently create empty
      // lists on weekends or days the user doesn't intend to plan. Today's
      // list is created explicitly via the sidebar's "Create today's list"
      // button when the user wants it.
      this.lists = await listAll();
      this.stats = await getStats();
      this.dailyStats = await getDailyStats(null, null);
      this.backlogPending = await listBacklogPending();
      this.allTags = await listTags();
      this.workflows = await listWorkflows();
      this.notes = await listNotes();
      this.articles = await listArticles();
      this.allTodos = await listAllTodos();
      this.indexDoc = await getIndexDoc();
      await this.refreshFeedbackBoards();
      await this.refreshFlashcards();
      await this.refreshFlashcardCategories();
      await this.refreshBlueprints();
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
    this.recordNav();
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

  // ---- Back navigation ----

  // Snapshot the CURRENT location so we can return to it later.
  private snapshotLoc(): NavLoc | null {
    switch (this.view) {
      case "home":
        return { view: "home" };
      case "list":
        return this.selected ? { view: "list", id: this.selected.id } : null;
      case "note":
        return this.selectedNote
          ? { view: "note", id: this.selectedNote.id }
          : null;
      case "article":
        return this.selectedArticle
          ? { view: "article", id: this.selectedArticle.id }
          : null;
      case "workflow":
        return this.selectedWorkflow
          ? { view: "workflow", id: this.selectedWorkflow.id }
          : null;
      case "feedback-board":
        return this.selectedFeedbackBoardId !== null
          ? { view: "feedback-board", id: this.selectedFeedbackBoardId }
          : { view: "feedback" };
      case "blueprint":
        return this.selectedBlueprint !== null
          ? { view: "blueprint", id: this.selectedBlueprint.id }
          : { view: "blueprints" };
      case "index":
      case "garden":
      case "map":
      case "feedback":
      case "activity":
      case "flashdeck":
      case "blueprints":
        return { view: this.view };
      default:
        return null;
    }
  }

  // Called at the top of every navigation entry point: pushes where we ARE now
  // so a later back() can return. No-op while restoring (suppressNav) and when
  // the destination would duplicate the current top of stack.
  private recordNav() {
    if (this.suppressNav) return;
    const loc = this.snapshotLoc();
    if (!loc) return;
    const top = this.navStack[this.navStack.length - 1] as
      | (NavLoc & { id?: number })
      | undefined;
    if (top && top.view === loc.view && top.id === (loc as { id?: number }).id) {
      return;
    }
    // Cap the stack so it can't grow without bound.
    this.navStack = [...this.navStack, loc].slice(-50);
  }

  get canGoBack(): boolean {
    return this.navStack.length > 0;
  }

  async back() {
    if (this.navStack.length === 0) return;
    const stack = [...this.navStack];
    const loc = stack.pop()!;
    this.navStack = stack;
    this.suppressNav = true;
    try {
      switch (loc.view) {
        case "home":
          await this.goHome();
          break;
        case "list":
          await this.select(loc.id);
          break;
        case "note":
          await this.selectNote(loc.id);
          break;
        case "article":
          await this.selectArticle(loc.id);
          break;
        case "workflow":
          await this.selectWorkflow(loc.id);
          break;
        case "index":
          await this.openIndex();
          break;
        case "garden":
          await this.openGarden();
          break;
        case "map":
          await this.openMap();
          break;
        case "feedback":
          await this.openFeedback();
          break;
        case "feedback-board":
          await this.openFeedbackBoard(loc.id);
          break;
        case "activity":
          await this.openActivity();
          break;
        case "flashdeck":
          await this.openFlashDeck();
          break;
        case "blueprints":
          await this.openBlueprints();
          break;
        case "blueprint":
          await this.openBlueprint(loc.id);
          break;
      }
    } finally {
      this.suppressNav = false;
    }
  }

  async goHome(focusToday = false) {
    this.recordNav();
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
      await this.refreshFeedbackBoards();
      await this.refreshFlashcards();
    } catch (e) {
      this.error = String(e);
    }
  }

  // ---- Notes ----

  async refreshNotes() {
    this.notes = await listNotes();
  }

  async selectNote(id: number) {
    this.recordNav();
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

  // ---- Quick actions (Stream Deck / ⌘⇧ shortcuts) ----

  // Open today's list if one exists (never auto-creates — Sprint 11). Mirrors
  // the sidebar's detection: today's date, not archived, lowest id wins.
  async openTodayList() {
    const today = todayIso();
    const candidates = this.lists.filter(
      (l) => l.date === today && !l.archived,
    );
    if (candidates.length === 0) {
      this.setFlash("No list for today yet — ⌘N to create one");
      return;
    }
    const list = candidates.reduce((a, b) => (b.id < a.id ? b : a));
    await this.select(list.id);
  }

  // ---- Focus mode (Sprint 28) ----

  // Resolve today's list (same detection as openTodayList / the sidebar) and
  // load its todos into the independent focus state, then show the overlay.
  // Never auto-creates a list (Sprint 11) — an absent list shows an empty
  // state that offers createFocusToday().
  async enterFocus() {
    const today = todayIso();
    const candidates = this.lists.filter(
      (l) => l.date === today && !l.archived,
    );
    if (candidates.length === 0) {
      this.focusListId = null;
      this.focusListTitle = null;
      this.focusTodos = [];
    } else {
      const list = candidates.reduce((a, b) => (b.id < a.id ? b : a));
      this.focusListId = list.id;
      this.focusListTitle = list.title;
      this.focusTodos = await listTodos(list.id);
    }
    this.focusMode = true;
  }

  exitFocus() {
    this.focusMode = false;
  }

  // Create today's list from within Focus and load it in place.
  async createFocusToday() {
    const created = await createList(
      defaultListTitleForDate(todayIso()),
      todayIso(),
    );
    this.focusListId = created.id;
    this.focusListTitle = created.title;
    this.focusTodos = await listTodos(created.id);
    await this.refreshLists();
  }

  // Toggle a todo shown in Focus. Updates the independent focus state, and —
  // if that same list is the one open behind the overlay — keeps this.todos
  // in sync so the underlying view reflects the change on exit.
  async toggleFocusTodo(todo: Todo) {
    const updated = await toggleTodo(todo.id);
    this.focusTodos = this.focusTodos.map((t) =>
      t.id === updated.id ? updated : t,
    );
    if (this.selected && this.selected.id === updated.listId) {
      this.todos = this.todos.map((t) => (t.id === updated.id ? updated : t));
    }
    await this.refreshLists();
  }

  // Designate / clear the single "quick access" article.
  toggleQuickArticle(id: number) {
    this.quickArticleId = this.quickArticleId === id ? null : id;
    if (typeof localStorage !== "undefined") {
      if (this.quickArticleId === null) {
        localStorage.removeItem(QUICK_ARTICLE_KEY);
        this.setFlash("Quick article cleared");
      } else {
        localStorage.setItem(QUICK_ARTICLE_KEY, String(this.quickArticleId));
        this.setFlash("Set as quick article (⌘⇧A)");
      }
    }
  }

  // Open the designated quick article, if it still exists.
  async openQuickArticle() {
    const id = this.quickArticleId;
    if (id === null || !this.articles.some((a) => a.id === id)) {
      this.setFlash("No quick article set — open an article and press the ★");
      return;
    }
    await this.selectArticle(id);
  }

  // ---- Index doc ----

  async openIndex() {
    this.recordNav();
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

  // ---- Garden ----

  async openGarden(force = false) {
    this.recordNav();
    this.view = "garden";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;

    const fresh = Date.now() - this.gardenBuiltAt < AppStore.GARDEN_TTL_MS;
    if (this.gardenGraph && fresh && !force) return;

    this.gardenLoading = true;
    try {
      const graph = await buildGraph({
        notes: this.notes,
        articles: this.articles,
        workflows: this.workflows,
        lists: this.lists,
        indexDoc: this.indexDoc,
      });
      this.gardenGraph = graph;
      this.gardenBuiltAt = Date.now();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.gardenLoading = false;
    }
  }

  invalidateGarden() {
    this.gardenBuiltAt = 0;
  }

  // ---- Master Map ----

  async openMap() {
    this.recordNav();
    this.view = "map";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    if (this.mapLoaded) return;
    this.mapLoading = true;
    try {
      const m = await getMap();
      this.mapNodes = m.nodes;
      this.mapEdges = m.edges;
      this.mapLoaded = true;
    } catch (e) {
      this.error = String(e);
    } finally {
      this.mapLoading = false;
    }
  }

  async refreshMap() {
    const m = await getMap();
    this.mapNodes = m.nodes;
    this.mapEdges = m.edges;
  }

  async addMapNode(
    kind: MapEntityKind,
    entityId: number,
    x: number,
    y: number,
  ): Promise<MapNode | null> {
    try {
      const created = await addMapNodeIpc(kind, entityId, x, y);
      this.mapNodes = [...this.mapNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addMapText(content: string, x: number, y: number): Promise<MapNode | null> {
    try {
      const created = await addMapTextIpc(content, x, y);
      this.mapNodes = [...this.mapNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addMapComment(content: string, x: number, y: number): Promise<MapNode | null> {
    try {
      const created = await addMapCommentIpc(content, x, y);
      this.mapNodes = [...this.mapNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addMapCustom(content: string, x: number, y: number): Promise<MapNode | null> {
    try {
      const created = await addMapCustomIpc(content, x, y);
      this.mapNodes = [...this.mapNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addMapTitle(content: string, x: number, y: number): Promise<MapNode | null> {
    try {
      const created = await addMapTitleIpc(content, x, y);
      this.mapNodes = [...this.mapNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async resizeMapNode(id: number, width: number, height: number) {
    try {
      const updated = await resizeMapNodeIpc(id, width, height);
      this.mapNodes = this.mapNodes.map((n) => (n.id === id ? updated : n));
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async updateMapNodeContent(id: number, content: string) {
    try {
      const updated = await updateMapNodeContentIpc(id, content);
      this.mapNodes = this.mapNodes.map((n) => (n.id === id ? updated : n));
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async moveMapNode(id: number, x: number, y: number) {
    try {
      const updated = await moveMapNodeIpc(id, x, y);
      this.mapNodes = this.mapNodes.map((n) => (n.id === id ? updated : n));
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async removeMapNode(id: number) {
    try {
      await removeMapNodeIpc(id);
      this.mapNodes = this.mapNodes.filter((n) => n.id !== id);
      // Edges cascade-delete on the backend; mirror locally.
      this.mapEdges = this.mapEdges.filter(
        (e) => e.sourceId !== id && e.targetId !== id,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async addMapEdge(
    sourceId: number,
    targetId: number,
    label: string | null = null,
  ): Promise<MapEdge | null> {
    try {
      const created = await addMapEdgeIpc(sourceId, targetId, label);
      this.mapEdges = [...this.mapEdges, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async updateMapEdgeLabel(id: number, label: string | null) {
    try {
      const updated = await updateMapEdgeLabelIpc(id, label);
      this.mapEdges = this.mapEdges.map((e) => (e.id === id ? updated : e));
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async removeMapEdge(id: number) {
    try {
      await removeMapEdgeIpc(id);
      this.mapEdges = this.mapEdges.filter((e) => e.id !== id);
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  // ---- Blueprints (Sprint 22) ----

  blueprints = $state<BlueprintSummary[]>([]);
  blueprintsLoaded = $state(false);
  selectedBlueprint = $state<Blueprint | null>(null);
  blueprintNodes = $state<BlueprintNode[]>([]);
  blueprintEdges = $state<BlueprintEdge[]>([]);
  blueprintLoading = $state(false);

  async openBlueprints() {
    this.recordNav();
    this.view = "blueprints";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    this.selectedBlueprint = null;
    await this.refreshBlueprints();
  }

  async refreshBlueprints() {
    try {
      this.blueprints = await listBlueprints();
      this.blueprintsLoaded = true;
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async openBlueprint(id: number) {
    this.recordNav();
    this.view = "blueprint";
    this.blueprintLoading = true;
    try {
      const s = await getBlueprint(id);
      this.selectedBlueprint = s.blueprint;
      this.blueprintNodes = s.nodes;
      this.blueprintEdges = s.edges;
    } catch (e) {
      this.setFlash(String(e));
      this.view = "blueprints";
    } finally {
      this.blueprintLoading = false;
    }
  }

  async newBlueprint(title: string) {
    try {
      const created = await createBlueprintIpc(title);
      await this.refreshBlueprints();
      await this.openBlueprint(created.id);
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async renameBlueprint(id: number, title: string) {
    const t = title.trim();
    if (!t) return;
    try {
      const updated = await renameBlueprintIpc(id, t);
      this.blueprints = this.blueprints.map((b) =>
        b.id === id ? { ...b, title: updated.title, updatedAt: updated.updatedAt } : b,
      );
      if (this.selectedBlueprint?.id === id) this.selectedBlueprint = updated;
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async setBlueprintPinned(id: number, pinned: boolean) {
    try {
      await setBlueprintPinnedIpc(id, pinned);
      this.blueprints = this.blueprints.map((b) =>
        b.id === id ? { ...b, pinned } : b,
      );
      if (this.selectedBlueprint?.id === id) {
        this.selectedBlueprint = { ...this.selectedBlueprint, pinned };
      }
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async setBlueprintArchived(id: number, archived: boolean) {
    try {
      await setBlueprintArchivedIpc(id, archived);
      this.blueprints = this.blueprints.map((b) =>
        b.id === id ? { ...b, archived } : b,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async deleteBlueprint(id: number) {
    const bp = this.blueprints.find((b) => b.id === id);
    const ok = await confirm(
      `"${bp?.title ?? `blueprint ${id}`}" and all its nodes will be permanently removed.`,
      { title: "Delete blueprint?", kind: "warning" },
    );
    if (!ok) return;
    try {
      await deleteBlueprintIpc(id);
      this.blueprints = this.blueprints.filter((b) => b.id !== id);
      if (this.selectedBlueprint?.id === id) {
        this.selectedBlueprint = null;
        this.view = "blueprints";
      }
      this.setFlash("Blueprint deleted");
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async addBlueprintCard(
    title: string,
    x: number,
    y: number,
  ): Promise<BlueprintNode | null> {
    if (!this.selectedBlueprint) return null;
    try {
      const created = await addBlueprintCardIpc(
        this.selectedBlueprint.id,
        title,
        x,
        y,
      );
      this.blueprintNodes = [...this.blueprintNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addBlueprintImageCard(
    imageUrl: string,
    x: number,
    y: number,
    width: number | null,
  ): Promise<BlueprintNode | null> {
    if (!this.selectedBlueprint) return null;
    try {
      const created = await addBlueprintImageCardIpc(
        this.selectedBlueprint.id,
        imageUrl,
        x,
        y,
        width,
      );
      this.blueprintNodes = [...this.blueprintNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addBlueprintFrame(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<BlueprintNode | null> {
    if (!this.selectedBlueprint) return null;
    try {
      const created = await addBlueprintFrameIpc(
        this.selectedBlueprint.id,
        x,
        y,
        width,
        height,
      );
      this.blueprintNodes = [...this.blueprintNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async addBlueprintDecorative(
    kind: "text" | "comment" | "title",
    content: string,
    x: number,
    y: number,
  ): Promise<BlueprintNode | null> {
    if (!this.selectedBlueprint) return null;
    try {
      const created = await addBlueprintDecorativeIpc(
        this.selectedBlueprint.id,
        kind,
        content,
        x,
        y,
      );
      this.blueprintNodes = [...this.blueprintNodes, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async updateBlueprintCard(
    id: number,
    title: string | null,
    description: string | null,
  ) {
    try {
      const updated = await updateBlueprintCardIpc(id, title, description);
      this.blueprintNodes = this.blueprintNodes.map((n) =>
        n.id === id ? updated : n,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async setBlueprintCardColor(id: number, color: string | null) {
    try {
      const updated = await setBlueprintCardColorIpc(id, color);
      this.blueprintNodes = this.blueprintNodes.map((n) =>
        n.id === id ? updated : n,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async updateBlueprintNodeContent(id: number, content: string) {
    try {
      const updated = await updateBlueprintNodeContentIpc(id, content);
      this.blueprintNodes = this.blueprintNodes.map((n) =>
        n.id === id ? updated : n,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async moveBlueprintNode(id: number, x: number, y: number) {
    try {
      const updated = await moveBlueprintNodeIpc(id, x, y);
      this.blueprintNodes = this.blueprintNodes.map((n) =>
        n.id === id ? updated : n,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async resizeBlueprintNode(id: number, width: number, height: number) {
    try {
      const updated = await resizeBlueprintNodeIpc(id, width, height);
      this.blueprintNodes = this.blueprintNodes.map((n) =>
        n.id === id ? updated : n,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async removeBlueprintNode(id: number) {
    try {
      await removeBlueprintNodeIpc(id);
      this.blueprintNodes = this.blueprintNodes.filter((n) => n.id !== id);
      // Edges cascade-delete on the backend; mirror locally.
      this.blueprintEdges = this.blueprintEdges.filter(
        (e) => e.sourceId !== id && e.targetId !== id,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async addBlueprintEdge(
    sourceId: number,
    targetId: number,
    sourceHandle: string | null,
    targetHandle: string | null,
  ): Promise<BlueprintEdge | null> {
    if (!this.selectedBlueprint) return null;
    try {
      const created = await addBlueprintEdgeIpc(
        this.selectedBlueprint.id,
        sourceId,
        targetId,
        sourceHandle,
        targetHandle,
      );
      this.blueprintEdges = [...this.blueprintEdges, created];
      return created;
    } catch (e) {
      this.setFlash(String(e));
      return null;
    }
  }

  async updateBlueprintEdgeLabel(id: number, label: string | null) {
    try {
      const updated = await updateBlueprintEdgeLabelIpc(id, label);
      this.blueprintEdges = this.blueprintEdges.map((e) =>
        e.id === id ? updated : e,
      );
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  async removeBlueprintEdge(id: number) {
    try {
      await removeBlueprintEdgeIpc(id);
      this.blueprintEdges = this.blueprintEdges.filter((e) => e.id !== id);
    } catch (e) {
      this.setFlash(String(e));
    }
  }

  // ---- Articles ----

  async refreshArticles() {
    this.articles = await listArticles();
  }

  async selectArticle(id: number) {
    this.recordNav();
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

  // ---- Pin (per-kind, by id; for Summary's row actions) ----

  async setNotePinnedById(id: number, pinned: boolean) {
    await setNotePinned(id, pinned);
    await this.refreshNotes();
    this.setFlash(pinned ? "Pinned" : "Unpinned");
  }

  async setArticlePinnedById(id: number, pinned: boolean) {
    await setArticlePinned(id, pinned);
    await this.refreshArticles();
    this.setFlash(pinned ? "Pinned" : "Unpinned");
  }

  async setWorkflowPinnedById(id: number, pinned: boolean) {
    await setWorkflowPinned(id, pinned);
    await this.refreshWorkflows();
    this.setFlash(pinned ? "Pinned" : "Unpinned");
  }

  async setListPinnedById(id: number, pinned: boolean) {
    await setListPinned(id, pinned);
    await this.refreshLists();
    this.setFlash(pinned ? "Pinned" : "Unpinned");
  }

  // ---- Archive (per-kind, called from Summary view) ----

  async setNoteArchived(id: number, archived: boolean) {
    await setNoteArchived(id, archived);
    await this.refreshNotes();
    this.setFlash(archived ? "Archived" : "Unarchived");
  }

  async setArticleArchived(id: number, archived: boolean) {
    await setArticleArchived(id, archived);
    await this.refreshArticles();
    this.setFlash(archived ? "Archived" : "Unarchived");
  }

  async setWorkflowArchived(id: number, archived: boolean) {
    await setWorkflowArchived(id, archived);
    await this.refreshWorkflows();
    this.setFlash(archived ? "Archived" : "Unarchived");
  }

  async setListArchived(id: number, archived: boolean) {
    if (archived) await archiveList(id);
    else await restoreList(id);
    await this.refreshLists();
    this.setFlash(archived ? "Archived" : "Unarchived");
  }

  // ---- Generic "new entity" used by the sidebar's Add modal ----

  async newEntity(
    kind: "note" | "article" | "workflow" | "flashcard" | "blueprint",
    title: string,
  ) {
    const t = title.trim();
    if (kind === "note") {
      const finalTitle = t || `Note — ${defaultListTitleForDate(todayIso())}`;
      await this.newNote(undefined, finalTitle);
    } else if (kind === "article") {
      await this.newArticle(t || "New article");
    } else if (kind === "flashcard") {
      await this.openFlashDeck();
      await this.newFlashcard(t || "New card");
    } else if (kind === "blueprint") {
      await this.newBlueprint(t || "New blueprint");
    } else {
      await this.newWorkflow(t || "New workflow");
    }
  }

  // ---- Delete by id (used by Summary view's list rows) ----

  async deleteNoteById(id: number) {
    const note = this.notes.find((n) => n.id === id);
    const label = note?.title ?? `note ${id}`;
    const ok = await confirm(`"${label}" will be permanently removed.`, {
      title: "Delete this note?",
      kind: "warning",
    });
    if (!ok) return;
    await deleteNoteIpc(id);
    await this.refreshNotes();
    if (this.selectedNote?.id === id) this.selectedNote = null;
    this.setFlash("Note deleted");
  }

  async deleteArticleById(id: number) {
    const article = this.articles.find((a) => a.id === id);
    const label = article?.title ?? `article ${id}`;
    const ok = await confirm(`"${label}" will be permanently removed.`, {
      title: "Delete this article?",
      kind: "warning",
    });
    if (!ok) return;
    await deleteArticleIpc(id);
    await this.refreshArticles();
    if (this.selectedArticle?.id === id) this.selectedArticle = null;
    this.setFlash("Article deleted");
  }

  async deleteWorkflowById(id: number) {
    const workflow = this.workflows.find((w) => w.id === id);
    const label = workflow?.title ?? `workflow ${id}`;
    const ok = await confirm(`"${label}" and all its steps will be removed.`, {
      title: "Delete this workflow?",
      kind: "warning",
    });
    if (!ok) return;
    await deleteWorkflowIpc(id);
    await this.refreshWorkflows();
    if (this.selectedWorkflow?.id === id) this.selectedWorkflow = null;
    this.setFlash("Workflow deleted");
  }

  async select(id: number) {
    this.recordNav();
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
    this.backlogPending = await listBacklogPending();
  }

  // ---- Backlog (Sprint 29) ----

  // Resolve (and cache) the id of the single backlog list, creating it on the
  // backend if it doesn't exist yet.
  async ensureBacklog(): Promise<number> {
    if (this.backlogId !== null) return this.backlogId;
    const bl = await listBacklog();
    this.backlogId = bl.id;
    return bl.id;
  }

  async openBacklog() {
    const id = await this.ensureBacklog();
    await this.select(id);
  }

  // Move a task off a daily list into the backlog.
  async sendTodoToBacklog(todo: Todo) {
    const backlogId = await this.ensureBacklog();
    await moveTodo(todo.id, backlogId);
    // Drop it from whatever list is currently loaded (it left that list).
    this.todos = this.todos.filter((t) => t.id !== todo.id);
    if (this.selectedTodoId === todo.id) this.selectedTodoId = null;
    await this.refreshLists();
    this.setFlash("Moved to backlog");
  }

  // Pull a backlog task into today's list — creating today's list if needed
  // (an explicit user action, unlike init(); cf. Sprint 11).
  async pullTodoToToday(todo: Todo) {
    const today = await createList(
      defaultListTitleForDate(todayIso()),
      todayIso(),
    );
    await moveTodo(todo.id, today.id);
    this.todos = this.todos.filter((t) => t.id !== todo.id);
    if (this.selectedTodoId === todo.id) this.selectedTodoId = null;
    await this.refreshLists();
    this.setFlash("Pulled to today");
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

  // ---- Feedback kanban ----

  feedbackBoards = $state<FeedbackBoardSummary[]>([]);
  feedbackBoardsLoaded = $state(false);
  selectedFeedbackBoardId = $state<number | null>(null);
  feedbackColumns = $state<FeedbackColumn[]>([]);
  feedbackCards = $state<FeedbackCardSummary[]>([]);
  selectedFeedbackCardId = $state<number | null>(null);
  feedbackComments = $state<FeedbackCardComment[]>([]);

  async openFeedback() {
    this.recordNav();
    this.view = "feedback";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    this.selectedFeedbackBoardId = null;
    this.selectedFeedbackCardId = null;
    await this.refreshFeedbackBoards();
  }

  async refreshFeedbackBoards(includeArchived = true) {
    this.feedbackBoards = await listFeedbackBoards(includeArchived);
    this.feedbackBoardsLoaded = true;
  }

  async openFeedbackBoard(boardId: number) {
    this.recordNav();
    this.view = "feedback-board";
    this.selectedFeedbackBoardId = boardId;
    this.selectedFeedbackCardId = null;
    this.feedbackComments = [];
    this.feedbackColumns = await listFeedbackColumns(boardId);
    this.feedbackCards = await listFeedbackCards(boardId);
  }

  async refreshFeedbackColumns() {
    if (this.selectedFeedbackBoardId === null) return;
    this.feedbackColumns = await listFeedbackColumns(this.selectedFeedbackBoardId);
  }

  async newFeedbackColumn(name: string) {
    if (this.selectedFeedbackBoardId === null) return;
    const n = name.trim();
    if (!n) return;
    await createFeedbackColumnIpc(this.selectedFeedbackBoardId, n);
    await this.refreshFeedbackColumns();
  }

  async renameFeedbackColumn(id: number, name: string) {
    const n = name.trim();
    if (!n) return;
    await renameFeedbackColumnIpc(id, n);
    await this.refreshFeedbackColumns();
  }

  async deleteFeedbackColumn(id: number) {
    const col = this.feedbackColumns.find((c) => c.id === id);
    const cardsInCol = this.feedbackCards.filter((c) => c.columnId === id).length;
    const label = col?.name ?? `column ${id}`;
    const ok = await confirm(
      cardsInCol > 0
        ? `"${label}" and its ${cardsInCol} card${cardsInCol === 1 ? "" : "s"} will be permanently removed.`
        : `"${label}" will be removed.`,
      { title: "Delete column?", kind: "warning" },
    );
    if (!ok) return;
    await deleteFeedbackColumnIpc(id);
    await this.refreshFeedbackColumns();
    await this.refreshFeedbackCards();
    this.setFlash("Column deleted");
  }

  async newFeedbackBoard(title: string) {
    const t = title.trim() || "Untitled board";
    const created = await createFeedbackBoardIpc(t);
    await this.refreshFeedbackBoards();
    await this.openFeedbackBoard(created.id);
  }

  async renameFeedbackBoard(id: number, title: string) {
    const t = title.trim();
    if (!t) return;
    await renameFeedbackBoardIpc(id, t);
    await this.refreshFeedbackBoards();
  }

  async setFeedbackBoardArchived(id: number, archived: boolean) {
    await setFeedbackBoardArchivedIpc(id, archived);
    await this.refreshFeedbackBoards();
    this.setFlash(archived ? "Board archived" : "Board unarchived");
  }

  async setFeedbackBoardPinned(id: number, pinned: boolean) {
    await setFeedbackBoardPinnedIpc(id, pinned);
    await this.refreshFeedbackBoards();
    this.setFlash(pinned ? "Pinned" : "Unpinned");
  }

  async deleteFeedbackBoard(id: number) {
    const board = this.feedbackBoards.find((b) => b.id === id);
    const label = board?.title ?? `board ${id}`;
    const ok = await confirm(
      `"${label}" and all its cards/comments will be permanently removed.`,
      { title: "Delete board?", kind: "warning" },
    );
    if (!ok) return;
    await deleteFeedbackBoardIpc(id);
    await this.refreshFeedbackBoards();
    if (this.selectedFeedbackBoardId === id) {
      this.selectedFeedbackBoardId = null;
      this.feedbackCards = [];
      this.view = "feedback";
    }
    this.setFlash("Board deleted");
  }

  async refreshFeedbackCards() {
    if (this.selectedFeedbackBoardId === null) return;
    this.feedbackCards = await listFeedbackCards(this.selectedFeedbackBoardId);
  }

  async newFeedbackCard(columnId: number, title: string, description = "") {
    const t = title.trim();
    if (!t) return;
    await createFeedbackCardIpc(columnId, t, description);
    await this.refreshFeedbackCards();
  }

  async updateFeedbackCard(
    id: number,
    title: string | null,
    description: string | null,
  ) {
    await updateFeedbackCardIpc(id, title, description);
    await this.refreshFeedbackCards();
  }

  async setFeedbackCardColor(id: number, color: string | null) {
    await setFeedbackCardColorIpc(id, color);
    await this.refreshFeedbackCards();
  }

  async moveFeedbackCard(
    id: number,
    targetColumnId: number,
    targetPosition: number,
  ) {
    await moveFeedbackCardIpc(id, targetColumnId, targetPosition);
    await this.refreshFeedbackCards();
  }

  async deleteFeedbackCard(id: number) {
    const card = this.feedbackCards.find((c) => c.id === id);
    const label = card?.title ?? `card ${id}`;
    const ok = await confirm(`"${label}" will be permanently removed.`, {
      title: "Delete card?",
      kind: "warning",
    });
    if (!ok) return;
    await deleteFeedbackCardIpc(id);
    await this.refreshFeedbackCards();
    if (this.selectedFeedbackCardId === id) {
      this.selectedFeedbackCardId = null;
      this.feedbackComments = [];
    }
    this.setFlash("Card deleted");
  }

  async openFeedbackCard(id: number) {
    this.selectedFeedbackCardId = id;
    this.feedbackComments = await listFeedbackCardComments(id);
  }

  closeFeedbackCard() {
    this.selectedFeedbackCardId = null;
    this.feedbackComments = [];
  }

  async addFeedbackComment(body: string) {
    if (this.selectedFeedbackCardId === null) return;
    const b = body.trim();
    if (!b) return;
    await addFeedbackCardCommentIpc(this.selectedFeedbackCardId, b);
    this.feedbackComments = await listFeedbackCardComments(
      this.selectedFeedbackCardId,
    );
    await this.refreshFeedbackCards();
  }

  async deleteFeedbackComment(id: number) {
    if (this.selectedFeedbackCardId === null) return;
    await deleteFeedbackCardCommentIpc(id);
    this.feedbackComments = await listFeedbackCardComments(
      this.selectedFeedbackCardId,
    );
    await this.refreshFeedbackCards();
  }

  // ---- Flash Deck ----

  flashcards = $state<Flashcard[]>([]);
  flashcardCategories = $state<FlashcardCategory[]>([]);
  selectedFlashcardId = $state<number | null>(null);

  async openFlashDeck() {
    this.recordNav();
    this.view = "flashdeck";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    this.selectedFlashcardId = null;
    await this.refreshFlashcards();
    await this.refreshFlashcardCategories();
  }

  async refreshFlashcards() {
    this.flashcards = await listFlashcards();
  }

  async refreshFlashcardCategories() {
    this.flashcardCategories = await listFlashcardCategories();
  }

  openFlashcard(id: number) {
    this.selectedFlashcardId = id;
  }
  // Navigate to the deck and open a card's panel (used from Summary/sidebar).
  async openFlashcardInDeck(id: number) {
    await this.openFlashDeck();
    this.selectedFlashcardId = id;
  }
  closeFlashcard() {
    this.selectedFlashcardId = null;
  }

  async newFlashcard(title = "New card") {
    const created = await createFlashcardIpc(title);
    await this.refreshFlashcards();
    this.selectedFlashcardId = created.id;
    return created;
  }

  async updateFlashcardText(
    id: number,
    title: string | null,
    body: string | null,
  ) {
    await updateFlashcardIpc(id, title, body);
    await this.refreshFlashcards();
  }

  async setFlashcardCategory(id: number, categoryId: number | null) {
    await setFlashcardCategoryIpc(id, categoryId);
    await this.refreshFlashcards();
  }
  async setFlashcardColor(id: number, color: string | null) {
    await setFlashcardColorIpc(id, color);
    await this.refreshFlashcards();
  }
  async setFlashcardEmoji(id: number, emoji: string | null) {
    await setFlashcardEmojiIpc(id, emoji);
    await this.refreshFlashcards();
  }
  async setFlashcardImage(id: number, imageUrl: string | null) {
    await setFlashcardImageIpc(id, imageUrl);
    await this.refreshFlashcards();
  }
  async moveFlashcard(id: number, targetPosition: number) {
    await moveFlashcardIpc(id, targetPosition);
    await this.refreshFlashcards();
  }
  async toggleFlashcardPin(id: number) {
    const c = this.flashcards.find((f) => f.id === id);
    if (!c) return;
    await setFlashcardPinnedIpc(id, !c.pinned);
    await this.refreshFlashcards();
    this.setFlash(!c.pinned ? "Pinned" : "Unpinned");
  }
  async setFlashcardArchived(id: number, archived: boolean) {
    await setFlashcardArchivedIpc(id, archived);
    await this.refreshFlashcards();
    this.setFlash(archived ? "Archived" : "Unarchived");
  }
  async deleteFlashcardById(id: number) {
    const c = this.flashcards.find((f) => f.id === id);
    const ok = await confirm(
      `"${c?.title ?? `card ${id}`}" will be permanently removed.`,
      { title: "Delete card?", kind: "warning" },
    );
    if (!ok) return;
    await deleteFlashcardIpc(id);
    if (this.selectedFlashcardId === id) this.selectedFlashcardId = null;
    await this.refreshFlashcards();
    this.setFlash("Card deleted");
  }

  async newFlashcardCategory(
    name: string,
    color: string | null = null,
    icon: string | null = null,
  ) {
    const n = name.trim();
    if (!n) return null;
    const created = await createFlashcardCategoryIpc(n, color, icon);
    await this.refreshFlashcardCategories();
    return created;
  }
  async updateFlashcardCategoryById(
    id: number,
    name: string | null,
    color: string | null,
    icon: string | null,
  ) {
    await updateFlashcardCategoryIpc(id, name, color, icon);
    await this.refreshFlashcardCategories();
    await this.refreshFlashcards();
  }
  async deleteFlashcardCategoryById(id: number) {
    const cat = this.flashcardCategories.find((c) => c.id === id);
    const ok = await confirm(
      `Delete category "${cat?.name ?? id}"? Cards keep, but lose this category.`,
      { title: "Delete category?", kind: "warning" },
    );
    if (!ok) return;
    await deleteFlashcardCategoryIpc(id);
    await this.refreshFlashcardCategories();
    await this.refreshFlashcards();
    this.setFlash("Category deleted");
  }

  // ---- Activity (Kandinsky weekly grid) ----

  weeklyActivity = $state<WeeklyActivity[]>([]);
  activityLoading = $state(false);

  async openActivity() {
    this.recordNav();
    this.view = "activity";
    this.selected = null;
    this.todos = [];
    this.selectedTodoId = null;
    this.selectedTodoTags = [];
    this.selectedWorkflow = null;
    this.workflowSteps = [];
    this.selectedNote = null;
    this.selectedArticle = null;
    await this.refreshWeeklyActivity();
  }

  async refreshWeeklyActivity(
    from: string | null = null,
    to: string | null = null,
  ) {
    this.activityLoading = true;
    try {
      this.weeklyActivity = await getWeeklyActivity(from, to);
    } catch (e) {
      this.error = String(e);
    } finally {
      this.activityLoading = false;
    }
  }
}

export const app = new AppStore();
