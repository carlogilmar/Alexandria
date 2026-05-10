import { invoke } from "@tauri-apps/api/core";

export type List = {
  id: number;
  title: string;
  date: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListSummary = {
  id: number;
  title: string;
  date: string;
  archived: boolean;
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
