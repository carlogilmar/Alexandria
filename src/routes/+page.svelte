<script lang="ts">
  let today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
  <h1 class="text-3xl font-semibold tracking-tight">AlertMediaBigPicture</h1>
  <p class="text-sm text-neutral-500 dark:text-neutral-400">
    {today}
  </p>
  <p class="mt-4 text-xs uppercase tracking-widest text-neutral-400">
    hello — M0 scaffold ready
  </p>
</main>
