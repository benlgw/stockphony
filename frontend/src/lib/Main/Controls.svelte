<script lang="ts">
    import ConnectionStatus from "./Controls/ConnectionStatus.svelte";
    import StockSearch from "./Controls/StockSearch.svelte";
    import Transport from "./Controls/Transport.svelte";
</script>

<!--
  The right-hand panel. It owns no state of its own: each child talks to the
  studio directly, so this file stays a layout shell.
-->
<aside class="panel" aria-label="Playback and search">
    <Transport />
    <StockSearch />
    <ConnectionStatus />
</aside>

<style>
    .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 1.125rem;
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
        /* Stays beside the lanes as they scroll past. */
        position: sticky;
        top: var(--scroll-gap);
    }
</style>
