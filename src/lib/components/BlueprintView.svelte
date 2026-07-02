<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import BlueprintEditor from "./BlueprintEditor.svelte";
  import { app } from "$lib/stores/app.svelte";
</script>

<!-- Keyed so switching blueprints remounts the editor (fresh identity caches
     + fitView on the new document). -->
{#key app.selectedBlueprint?.id}
  <SvelteFlowProvider>
    <BlueprintEditor />
  </SvelteFlowProvider>
{/key}
