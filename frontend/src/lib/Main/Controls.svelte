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
    <div class="panel-transport">
        <Transport />
    </div>
    <StockSearch />
    <ConnectionStatus />
</aside>

<!--
  On phones, play, pause and restart move into a bar fixed to the bottom of
  the screen, within thumb reach however far down you've scrolled. It's the
  same component, so both always show the same state; only one is ever visible.
-->
<div class="mobile-bar">
    <Transport />
</div>

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

    .mobile-bar {
        display: none;
    }

    /* Phone layout: 760px and narrower. Every component uses this same breakpoint. */
    @media (max-width: 760px) {
        /* Search first, then the sections, in one column. */
        .panel {
            order: -1;
            position: static;
            padding: 0.875rem;
        }

        .panel-transport {
            display: none;
        }

        .mobile-bar {
            display: block;
            position: fixed;
            inset: auto 0 0 0;
            z-index: 20;
            padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
            background: var(--panel);
            border-top: 1px solid var(--border);
        }
    }
</style>
