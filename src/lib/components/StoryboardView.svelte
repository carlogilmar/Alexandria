<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import { app } from "$lib/stores/app.svelte";
  import StoryboardEditor from "$lib/components/StoryboardEditor.svelte";
</script>

<!-- Keyed per storyboard so the editor + its identity caches reset. -->
{#key app.selectedStoryboard?.id}
  <SvelteFlowProvider>
    <StoryboardEditor />
  </SvelteFlowProvider>
{/key}
