<script lang="ts">
    import { SECTIONS } from "$lib/core/sections";
    import SectionLane from "./Stocks/SectionLane.svelte";
</script>

<!--
  The five lanes of the mix. SECTIONS is a fixed list, so this component is
  just the column that holds them; everything interesting happens in SectionLane.
-->
<div class="lanes">
    {#each SECTIONS as section (section.id)}
        <SectionLane {section} />
    {/each}
</div>

<style>
    .lanes {
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
        /* Stops a wide chart from stretching this grid column. */
        min-width: 0;
    }
</style>
