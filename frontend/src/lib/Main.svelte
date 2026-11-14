<script lang="ts">
    import Controls from "./Main/Controls.svelte";
    import Stocks from "./Main/Stocks.svelte";
</script>

<main>
    <Stocks />
    <Controls />
</main>

<style>
    /* Grid rather than flex: the control panel is a fixed 320px and the lanes
       take whatever is left. minmax(0, 1fr) is the important half — a plain 1fr
       lets wide children (the charts) push the column past its share. */
    main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 1.25rem;
        align-items: start;
    }
</style>
