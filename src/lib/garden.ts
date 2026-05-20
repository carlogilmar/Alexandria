import {
  articleById,
  noteById,
  type ArticleSummary,
  type IndexDoc,
  type ListSummary,
  type NoteSummary,
  type WorkflowSummary,
} from "$lib/ipc";

export type GardenKind = "note" | "list" | "workflow" | "article";

export type Maturity = "seedling" | "budding" | "evergreen" | "dormant";

export type GardenNode = {
  id: string;            // "kind:id"
  kind: GardenKind;
  entityId: number;
  title: string;
  pinned: boolean;
  maturity: Maturity;
  createdAt: string;
  updatedAt: string;
  date: string | null;   // YYYY-MM-DD when relevant (notes, lists)
  degree: number;        // filled after edge collection
  // d3-force mutates these:
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export type GardenEdgeKind = "embed" | "reference" | "same-day";

export type GardenEdge = {
  source: string | GardenNode;
  target: string | GardenNode;
  kind: GardenEdgeKind;
};

export type GardenGraph = {
  nodes: GardenNode[];
  edges: GardenEdge[];
};

const EMBED_TOKEN = /\{\{(note|list|workflow|article):(\d+)\}\}/g;
// Markdown link with internal href like [label](note:5).
const REF_LINK = /\[[^\]]*\]\((note|list|workflow|article):(\d+)\)/g;

// SQLite returns "YYYY-MM-DD HH:MM:SS" UTC. Treat as ISO-ish.
function toDate(raw: string): Date {
  return new Date(raw.replace(" ", "T") + "Z");
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function classifyMaturity(createdAt: string, updatedAt: string): Maturity {
  const now = Date.now();
  const created = toDate(createdAt).getTime();
  const updated = toDate(updatedAt).getTime();
  const ageDays = (now - created) / DAY_MS;
  const sinceEditDays = (now - updated) / DAY_MS;

  if (sinceEditDays > 90) return "dormant";
  if (ageDays < 7) return "seedling";
  if (sinceEditDays < 30) return "budding";
  return "evergreen";
}

function pushUniqueEdge(
  seen: Set<string>,
  out: GardenEdge[],
  source: string,
  target: string,
  kind: GardenEdgeKind,
) {
  if (source === target) return;
  const key = `${source}->${target}:${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ source, target, kind });
}

function scanBodyForEdges(
  sourceId: string,
  body: string,
  knownNodeIds: Set<string>,
  seen: Set<string>,
  out: GardenEdge[],
) {
  let m: RegExpExecArray | null;
  EMBED_TOKEN.lastIndex = 0;
  while ((m = EMBED_TOKEN.exec(body))) {
    const target = `${m[1]}:${m[2]}`;
    if (knownNodeIds.has(target)) {
      pushUniqueEdge(seen, out, sourceId, target, "embed");
    }
  }
  REF_LINK.lastIndex = 0;
  while ((m = REF_LINK.exec(body))) {
    const target = `${m[1]}:${m[2]}`;
    if (knownNodeIds.has(target)) {
      pushUniqueEdge(seen, out, sourceId, target, "reference");
    }
  }
}

export type GardenSource = {
  notes: NoteSummary[];
  articles: ArticleSummary[];
  workflows: WorkflowSummary[];
  lists: ListSummary[];
  indexDoc: IndexDoc;
};

/**
 * Builds the full graph by fetching note + article bodies in parallel.
 * Same-day soft edges link notes and lists with identical `date`.
 */
export async function buildGraph(src: GardenSource): Promise<GardenGraph> {
  // 1. Nodes
  const nodes: GardenNode[] = [];
  const byId = new Map<string, GardenNode>();

  const addNode = (n: GardenNode) => {
    nodes.push(n);
    byId.set(n.id, n);
  };

  for (const x of src.notes) {
    addNode({
      id: `note:${x.id}`,
      kind: "note",
      entityId: x.id,
      title: x.title,
      pinned: x.pinned,
      maturity: "budding", // refined after we fetch the full record
      createdAt: "",
      updatedAt: "",
      date: x.date,
      degree: 0,
    });
  }
  for (const x of src.articles) {
    addNode({
      id: `article:${x.id}`,
      kind: "article",
      entityId: x.id,
      title: x.title,
      pinned: x.pinned,
      maturity: "budding",
      createdAt: "",
      updatedAt: x.updatedAt,
      date: null,
      degree: 0,
    });
  }
  for (const x of src.workflows) {
    addNode({
      id: `workflow:${x.id}`,
      kind: "workflow",
      entityId: x.id,
      title: x.title,
      pinned: x.pinned,
      maturity: "budding",
      createdAt: "",
      updatedAt: "",
      date: null,
      degree: 0,
    });
  }
  for (const x of src.lists) {
    addNode({
      id: `list:${x.id}`,
      kind: "list",
      entityId: x.id,
      title: x.title,
      pinned: x.pinned,
      maturity: "budding",
      createdAt: "",
      updatedAt: "",
      date: x.date,
      degree: 0,
    });
  }

  const knownIds = new Set(byId.keys());

  // 2. Fetch all bodies in parallel.
  const [fullNotes, fullArticles] = await Promise.all([
    Promise.all(src.notes.map((n) => noteById(n.id).catch(() => null))),
    Promise.all(src.articles.map((a) => articleById(a.id).catch(() => null))),
  ]);

  // Refine maturity + collect edges from bodies.
  const edges: GardenEdge[] = [];
  const seen = new Set<string>();

  for (const note of fullNotes) {
    if (!note) continue;
    const node = byId.get(`note:${note.id}`);
    if (node) {
      node.createdAt = note.createdAt;
      node.updatedAt = note.updatedAt;
      node.maturity = classifyMaturity(note.createdAt, note.updatedAt);
    }
    scanBodyForEdges(`note:${note.id}`, note.body, knownIds, seen, edges);
  }
  for (const art of fullArticles) {
    if (!art) continue;
    const node = byId.get(`article:${art.id}`);
    if (node) {
      node.createdAt = art.createdAt;
      node.updatedAt = art.updatedAt;
      node.maturity = classifyMaturity(art.createdAt, art.updatedAt);
    }
    scanBodyForEdges(`article:${art.id}`, art.body, knownIds, seen, edges);
  }

  // 3. Index doc as a pseudo-source (anonymous; refs become edges *into* targets
  // without a visible "Index" node, to keep the picture clean). We instead show
  // these as edges from each referenced node to itself? Simpler: skip — users
  // can already open Index from the sidebar.
  // (Kept hook for future, intentionally noop now.)
  void src.indexDoc;

  // 4. Same-day soft edges between notes and lists.
  const listsByDate = new Map<string, GardenNode[]>();
  for (const node of nodes) {
    if (node.kind !== "list" || !node.date) continue;
    const bucket = listsByDate.get(node.date) ?? [];
    bucket.push(node);
    listsByDate.set(node.date, bucket);
  }
  for (const node of nodes) {
    if (node.kind !== "note" || !node.date) continue;
    const sameDayLists = listsByDate.get(node.date);
    if (!sameDayLists) continue;
    for (const lst of sameDayLists) {
      pushUniqueEdge(seen, edges, node.id, lst.id, "same-day");
    }
  }

  // 5. Compute degree.
  for (const e of edges) {
    const sId = typeof e.source === "string" ? e.source : e.source.id;
    const tId = typeof e.target === "string" ? e.target : e.target.id;
    const s = byId.get(sId);
    const t = byId.get(tId);
    if (s) s.degree += 1;
    if (t) t.degree += 1;
  }

  return { nodes, edges };
}
