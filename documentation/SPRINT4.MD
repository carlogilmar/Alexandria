# Sprint 4

Features:

We already have implemented the todo list very well, now it's time to complement with another type of file that any user can create: workflows.

- A workflow should be a list of steps, like a chain.
- This is help to build knowledge in a very easy way.
- This should be written as a simple list, so the user can add, edit, remove steps very easy.
- Every item in the list can have sublists.
- The main workflow should be displayed as a visualization that shows the chain elegant, the goal is show the user a chain of thoughts.
- For the first stage we need to render a very basic visualization for the main chain, then we can discuss how to render the sublists of every item.
- The user can create too many workflows as he needs, this will help any user to create workflows for personal usage to follow in stages like onboardings for example.

---

## Implementation notes — Stage 1

### Data model

Added migration `src-tauri/migrations/0002_workflows.sql` with two new tables, both designed to survive into Stage 2:

```sql
workflows(id, title, description, created_at, updated_at)
workflow_steps(id, workflow_id, parent_step_id, text, position, created_at, updated_at)
```

`parent_step_id` is nullable and self-references `workflow_steps(id)` with `ON DELETE CASCADE`. Stage 1 only writes/reads steps where `parent_step_id IS NULL`; the schema is already correct for hierarchical sublists in Stage 2 — no further migration will be needed when we add sublist rendering.

`position` is scoped *per parent* (top-level steps have their own 0,1,2… sequence; sublists of step A have a separate 0,1,2…). The reorder SQL uses `parent_step_id IS ?` so passing `NULL` only touches top-level steps.

### Rust surface

New module `src-tauri/src/commands/workflows.rs` with eleven Tauri commands:

- `list_workflows` / `workflow_by_id` / `create_workflow` / `rename_workflow` / `update_workflow_description` / `delete_workflow`
- `list_workflow_steps` / `create_workflow_step` / `update_workflow_step` / `delete_workflow_step` / `reorder_workflow_steps`

Delete is a *hard* delete (workflows aren't archived like lists — they're closer to documents).

13 new unit tests cover: workflow CRUD, step CRUD, position assignment scoped to parent, cascade behavior on workflow deletion, sublist position independence, reorder. **Total Rust test count is now 54/54 passing.**

### Frontend

- `view` extended to `"home" | "list" | "workflow"`; routing in `+page.svelte` renders the new component.
- Store gained `workflows`, `selectedWorkflow`, `workflowSteps`, plus methods: `selectWorkflow`, `newWorkflow`, `renameSelectedWorkflow`, `deleteSelectedWorkflow` (native confirm), `addWorkflowStep`, `editWorkflowStep`, `removeWorkflowStep`, `reorderWorkflowStepsLocal`, `commitWorkflowReorder`.
- Sidebar gained a **Workflows** section above Lists, with a `+` button, step count chip per workflow, and a highlight when the active workflow matches.
- `WorkflowView.svelte` is the new main pane:
  - Editable title (click to rename) + delete button
  - **Vertical chain visualization**: each step has a circular numbered "bullet" (blue), connected to the next bullet by a gradient line. Empty state when no steps yet.
  - Inline-editable step text (Enter or blur commits)
  - Delete button on hover per step
  - **+ Add a step** input always at the bottom, autofocused on view open
  - **Reorder via pointer events on the bullet itself** — same pattern as todos. Press and hold the bullet, drag, the row follows, release commits. (Top-level only in Stage 1; sublist reorder will reuse the same primitive.)

### Visual approach for the chain

The "elegant chain" is achieved with pure CSS:
- Bullet: 28px circle with the step index, blue background, subtle shadow
- Connector: a 2px vertical line absolutely-positioned at the bullet's center, with a gradient that fades downward — implies forward motion without being heavy
- No box-shadowed cards or icons — the focus is on the *sequence*, not the individual steps

### Where Stage 2 picks up

Schema and store both already speak `parentStepId`. Stage 2 needs:
- A way to expand a step in the UI and render its children inline (or in a nested column)
- An "Indent" affordance — keyboard `Tab` while editing, or a hover button — that calls `createWorkflowStep` with `parentStepId` set, or moves an existing step under another
- The chain visualization for sublists — likely a smaller-bullet variant indented under its parent, with its own mini-line

Open design questions for that step (worth your input before we build):
1. Should sublists be rendered *inline* under their parent (nested), or in a side column when a step is selected?
2. Should sublists themselves nest further (workflow of workflows), or is one level enough?
3. Should sublist reorder be constrained to the same parent, or allow promoting/demoting between levels?

---

## Sprint 5 candidates

- **Sublists rendering + indent/outdent** — Stage 2 of this sprint
- **Workflow templates** — duplicate an existing workflow as a starting point ("clone onboarding for next hire")
- **Workflow export** — Markdown export of a workflow, matching the lists export format
- **Run mode** — a focused "do the workflow now" UI that walks one step at a time, marks done, captures notes per step
- **Workflow search** — extend the existing search to also match workflow step text
- **Step descriptions** — short freeform note per step (alongside text), useful for "do X — see link Y" patterns
