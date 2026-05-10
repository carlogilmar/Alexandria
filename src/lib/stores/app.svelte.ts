import {
  listToday,
  listAll,
  listById,
  listTodos,
  createList,
  renameList as renameListIpc,
  createTodo,
  toggleTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
  type List,
  type ListSummary,
  type Todo,
} from "$lib/ipc";

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

class AppStore {
  lists = $state<ListSummary[]>([]);
  selected = $state<List | null>(null);
  todos = $state<Todo[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);

  async init() {
    this.loading = true;
    this.error = null;
    try {
      const today = await listToday();
      this.selected = today;
      this.todos = await listTodos(today.id);
      this.lists = await listAll();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  async select(id: number) {
    if (this.selected?.id === id) return;
    try {
      this.selected = await listById(id);
      this.todos = await listTodos(id);
    } catch (e) {
      this.error = String(e);
    }
  }

  async refreshLists() {
    this.lists = await listAll();
  }

  async newList(title = "New list") {
    const created = await createList(title, todayIso());
    await this.refreshLists();
    await this.select(created.id);
  }

  async renameSelected(title: string) {
    if (!this.selected) return;
    const updated = await renameListIpc(this.selected.id, title);
    this.selected = updated;
    await this.refreshLists();
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
}

export const app = new AppStore();
