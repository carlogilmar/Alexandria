<script lang="ts">
  import { app } from "$lib/stores/app.svelte";

  // --- setup / unlock form state ---
  let pw = $state("");
  let pw2 = $state("");
  let unlockError = $state(false);
  let busy = $state(false);

  // --- add-entry form state ---
  let newTitle = $state("");
  let newPw = $state("");
  let showNewPw = $state(false);

  // --- reveal state: id → plaintext (only while shown) ---
  let revealed = $state<Record<number, string>>({});
  let copiedId = $state<number | null>(null);

  async function doSetup() {
    if (busy) return;
    if (pw.length === 0) return;
    if (pw !== pw2) {
      unlockError = true;
      return;
    }
    busy = true;
    const ok = await app.setupVault(pw);
    busy = false;
    if (ok) {
      pw = "";
      pw2 = "";
    }
  }

  async function doUnlock() {
    if (busy || pw.length === 0) return;
    busy = true;
    const ok = await app.unlockVault(pw);
    busy = false;
    if (ok) {
      pw = "";
      unlockError = false;
    } else {
      unlockError = true;
    }
  }

  async function doAdd() {
    if (!newTitle.trim() || !newPw) return;
    const ok = await app.addSecret(newTitle, newPw);
    if (ok) {
      newTitle = "";
      newPw = "";
      showNewPw = false;
    }
  }

  async function toggleReveal(id: number) {
    if (revealed[id] !== undefined) {
      const next = { ...revealed };
      delete next[id];
      revealed = next;
      return;
    }
    const pt = await app.revealSecret(id);
    if (pt !== null) revealed = { ...revealed, [id]: pt };
  }

  async function copy(id: number) {
    const pt = revealed[id] ?? (await app.revealSecret(id));
    if (pt === null) return;
    try {
      await navigator.clipboard.writeText(pt);
      copiedId = id;
      app.setFlash("Copied — clipboard clears in 20s");
      const val = pt;
      setTimeout(() => {
        // Best-effort clear: only wipe if the clipboard still holds this value.
        navigator.clipboard
          .readText()
          .then((cur) => {
            if (cur === val) void navigator.clipboard.writeText("");
          })
          .catch(() => void navigator.clipboard.writeText("").catch(() => {}));
        if (copiedId === id) copiedId = null;
      }, 20000);
    } catch {
      app.setFlash("Couldn't access the clipboard");
    }
  }

  async function remove(id: number, title: string) {
    if (!confirm(`Delete the password for "${title}"? This can't be undone.`))
      return;
    await app.deleteSecret(id);
    const next = { ...revealed };
    delete next[id];
    revealed = next;
  }

  // Client-side strong password generator.
  function generate(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";
    const n = 20;
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    let out = "";
    for (let i = 0; i < n; i++) out += chars[buf[i] % chars.length];
    return out;
  }
</script>

<main class="mx-auto flex min-h-full w-full max-w-xl flex-col px-8 py-10">
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Passwords
      </h1>
      <p class="mt-1 text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Encrypted on-device · site passwords
      </p>
    </div>
    {#if app.vaultInitialized && app.vaultUnlocked}
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        onclick={() => app.lockVault()}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
        </svg>
        Lock
      </button>
    {/if}
  </header>

  {#if !app.vaultInitialized}
    <!-- First run: set a master password -->
    <div class="rounded-xl border border-neutral-200/70 bg-white/60 p-5 dark:border-neutral-700/60 dark:bg-neutral-900/40">
      <h2 class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Set a master password</h2>
      <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        It encrypts every password here and is never stored. <strong class="text-amber-600 dark:text-amber-400">If you forget it, the data can't be recovered</strong> — there's no reset.
      </p>
      <form class="mt-4 flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); void doSetup(); }}>
        <input type="password" bind:value={pw} placeholder="Master password" autocomplete="new-password"
          class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900" />
        <input type="password" bind:value={pw2} placeholder="Confirm master password" autocomplete="new-password"
          class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900" />
        {#if unlockError}<p class="text-xs text-red-500">The two passwords don't match.</p>{/if}
        <button type="submit" disabled={busy || !pw}
          class="mt-1 self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
          Create vault
        </button>
      </form>
    </div>
  {:else if !app.vaultUnlocked}
    <!-- Locked -->
    <div class="rounded-xl border border-neutral-200/70 bg-white/60 p-5 dark:border-neutral-700/60 dark:bg-neutral-900/40">
      <h2 class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Vault locked</h2>
      <form class="mt-3 flex gap-2" onsubmit={(e) => { e.preventDefault(); void doUnlock(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" bind:value={pw} placeholder="Master password" autocomplete="current-password" autofocus
          class="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900" />
        <button type="submit" disabled={busy || !pw}
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
          Unlock
        </button>
      </form>
      {#if unlockError}<p class="mt-2 text-xs text-red-500">Incorrect master password.</p>{/if}
      {#if app.secrets.length > 0}
        <p class="mt-4 text-xs text-neutral-400 dark:text-neutral-500">{app.secrets.length} saved {app.secrets.length === 1 ? "entry" : "entries"} — unlock to view.</p>
      {/if}
    </div>
  {:else}
    <!-- Unlocked: add + list -->
    <form class="mb-5 flex flex-col gap-2 rounded-xl border border-neutral-200/70 bg-white/60 p-3 dark:border-neutral-700/60 dark:bg-neutral-900/40"
      onsubmit={(e) => { e.preventDefault(); void doAdd(); }}>
      <input bind:value={newTitle} placeholder="Site or label (e.g. GitHub)"
        class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900" />
      <div class="flex gap-2">
        <input type={showNewPw ? "text" : "password"} bind:value={newPw} placeholder="Password" autocomplete="off"
          class="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900" />
        <button type="button" title="Show/hide" class="rounded-lg border border-neutral-200 px-2.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" onclick={() => (showNewPw = !showNewPw)}>
          {showNewPw ? "🙈" : "👁"}
        </button>
        <button type="button" title="Generate a strong password" class="rounded-lg border border-neutral-200 px-2.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" onclick={() => { newPw = generate(); showNewPw = true; }}>
          ⚙︎
        </button>
      </div>
      <button type="submit" disabled={!newTitle.trim() || !newPw}
        class="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
        Add
      </button>
    </form>

    {#if app.secrets.length === 0}
      <p class="mt-8 text-center text-sm text-neutral-400 dark:text-neutral-500">No passwords yet. Add one above.</p>
    {:else}
      <ul class="flex flex-col gap-1.5">
        {#each app.secrets as s (s.id)}
          <li class="group flex items-center gap-3 rounded-lg border border-neutral-200/70 bg-white/60 px-3 py-2.5 dark:border-neutral-700/60 dark:bg-neutral-900/40">
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">{s.title}</span>
            <span class="w-40 shrink-0 truncate text-right font-mono text-sm text-neutral-500 dark:text-neutral-400">
              {revealed[s.id] !== undefined ? revealed[s.id] : "••••••••••"}
            </span>
            <button type="button" title="Reveal / hide" aria-label="Reveal" class="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200" onclick={() => toggleReveal(s.id)}>
              {revealed[s.id] !== undefined ? "🙈" : "👁"}
            </button>
            <button type="button" title="Copy to clipboard" aria-label="Copy" class="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200" onclick={() => copy(s.id)}>
              {copiedId === s.id ? "✓" : "📋"}
            </button>
            <button type="button" title="Delete" aria-label="Delete" class="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400" onclick={() => remove(s.id, s.title)}>
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
            </button>
          </li>
        {/each}
      </ul>
      <p class="mt-6 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
        Auto-locks after 5 minutes idle and when the app closes.
      </p>
    {/if}
  {/if}
</main>
