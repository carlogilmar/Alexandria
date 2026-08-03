// Regenerate src/lib/storyIcons.ts (Storyboard icon set).
// One-off deps (not kept in package.json to keep installs fast):
//   pnpm add -D lucide-static devicon && node scripts/gen-story-icons.mjs && pnpm rm lucide-static devicon
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const L = "node_modules/lucide-static/icons";
const D = "node_modules/devicon/icons";

// ---- concept icons (Lucide, tinted with the node accent via currentColor) ----
// [lucide-file, key, label]
const CONCEPTS = [
  ["database", "database", "Database"],
  ["server", "server", "Server"],
  ["cloud", "cloud", "Cloud"],
  ["globe", "globe", "Web / Internet"],
  ["network", "network", "Network"],
  ["terminal", "terminal", "Terminal / CLI"],
  ["git-branch", "git-branch", "Branch"],
  ["git-merge", "git-merge", "Merge"],
  ["git-commit-horizontal", "git-commit", "Commit"],
  ["braces", "braces", "Function / JSON"],
  ["code", "code", "Code"],
  ["package", "package", "Package / Module"],
  ["box", "box", "Service"],
  ["container", "container", "Container"],
  ["layers", "layers", "Layers"],
  ["cpu", "cpu", "CPU / Compute"],
  ["hard-drive", "hard-drive", "Disk / Storage"],
  ["memory-stick", "memory", "Memory / Cache"],
  ["key", "key", "Key / Secret"],
  ["lock-keyhole", "lock", "Auth / Lock"],
  ["shield-check", "shield", "Security"],
  ["user", "user", "User"],
  ["users", "users", "Users"],
  ["folder", "folder", "Folder"],
  ["file-code", "file", "File"],
  ["mail", "mail", "Email / Message"],
  ["webhook", "webhook", "Webhook"],
  ["zap", "event", "Event"],
  ["timer", "timer", "Scheduler / Timer"],
  ["workflow", "workflow", "Workflow / Pipeline"],
  ["bug", "bug", "Bug"],
  ["rocket", "rocket", "Deploy"],
  ["gauge", "gauge", "Monitoring"],
  ["route", "route", "Routing / Gateway"],
  ["split", "split", "Load balancer"],
  ["funnel", "filter", "Filter / Queue"],
  ["radio-tower", "broker", "Broker / PubSub"],
  ["ticket", "ticket", "Ticket / Issue"],
  ["square-kanban", "kanban", "Kanban board"],
  ["list-todo", "todo", "Todo / Task"],
  ["list-checks", "backlog", "Backlog"],
  ["git-pull-request", "pull-request", "Pull request"],
  ["message-square", "comment", "Comment"],
  ["flag", "flag", "Flag / Priority"],
  ["bell", "bell", "Notification"],
  ["calendar", "calendar", "Calendar / Sprint"],
  ["bookmark", "bookmark", "Bookmark"],
  ["check", "check", "Done / Check"],
  ["tag", "tag", "Tag / Label"],
];

// ---- brand logos (Devicon, multi-color -original) ----
// [devicon-folder, key, label]
const BRANDS = [
  ["docker", "docker", "Docker"],
  ["kubernetes", "kubernetes", "Kubernetes"],
  ["postgresql", "postgres", "PostgreSQL"],
  ["mysql", "mysql", "MySQL"],
  ["mongodb", "mongodb", "MongoDB"],
  ["redis", "redis", "Redis"],
  ["nodejs", "node", "Node.js"],
  ["react", "react", "React"],
  ["vuejs", "vue", "Vue"],
  ["svelte", "svelte", "Svelte"],
  ["typescript", "typescript", "TypeScript"],
  ["javascript", "javascript", "JavaScript"],
  ["python", "python", "Python"],
  ["rust", "rust", "Rust"],
  ["go", "go", "Go"],
  ["java", "java", "Java"],
  ["nginx", "nginx", "Nginx"],
  ["git", "git", "Git"],
  ["github", "github", "GitHub"],
  ["amazonwebservices", "aws", "AWS"],
  ["googlecloud", "gcp", "Google Cloud"],
  ["graphql", "graphql", "GraphQL"],
  ["rabbitmq", "rabbitmq", "RabbitMQ"],
  ["apachekafka", "kafka", "Kafka"],
  ["elasticsearch", "elasticsearch", "Elasticsearch"],
  ["tailwindcss", "tailwind", "Tailwind"],
  ["elixir", "elixir", "Elixir"],
  ["jira", "jira", "Jira"],
  ["confluence", "confluence", "Confluence"],
  ["trello", "trello", "Trello"],
  ["slack", "slack", "Slack"],
  ["figma", "figma", "Figma"],
  ["gitlab", "gitlab", "GitLab"],
  ["bitbucket", "bitbucket", "Bitbucket"],
];

function lucideBody(file) {
  const raw = readFileSync(`${L}/${file}.svg`, "utf8");
  // strip the <svg ...> wrapper + license comment → keep inner shapes only
  const inner = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg[\s\S]*?>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return inner;
}

function devicon(folder) {
  for (const v of ["original", "plain"]) {
    const p = `${D}/${folder}/${folder}-${v}.svg`;
    if (existsSync(p)) {
      let svg = readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();
      // drop fixed width/height so CSS can size it; keep viewBox + fills
      svg = svg.replace(/\s(width|height)="[^"]*"/g, "");
      return svg.replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

const out = [];
for (const [file, key, label] of CONCEPTS) {
  if (!existsSync(`${L}/${file}.svg`)) {
    console.warn("MISSING lucide:", file);
    continue;
  }
  out.push({ key, label, kind: "concept", body: lucideBody(file) });
}
let brandMissing = 0;
for (const [folder, key, label] of BRANDS) {
  const svg = devicon(folder);
  if (!svg) {
    console.warn("MISSING devicon:", folder);
    brandMissing++;
    continue;
  }
  out.push({ key: `b:${key}`, label, kind: "brand", body: svg });
}

const header = `// AUTO-GENERATED (scratchpad/gen-icons.mjs) — Storyboard icon set.
// Concept icons: Lucide (ISC) — single-color line icons, tint via currentColor.
// Brand logos: Devicon (MIT) — multi-color -original marks (self-colored).
// The node's \`icon\` field stores a key here, else it's treated as freeform text/emoji.
export type StoryIconKind = "concept" | "brand";
export type StoryIcon = { key: string; label: string; kind: StoryIconKind; body: string };

export const STORY_ICONS: StoryIcon[] = ${JSON.stringify(out, null, 2)};

export const STORY_ICON_MAP: Map<string, StoryIcon> = new Map(
  STORY_ICONS.map((i) => [i.key, i]),
);
`;

writeFileSync("src/lib/storyIcons.ts", header);
console.log(`wrote ${out.length} icons (concepts + ${BRANDS.length - brandMissing} brands) → src/lib/storyIcons.ts`);
