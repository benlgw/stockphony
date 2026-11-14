<script lang="ts">
    /** One row of the search results: draggable, with a keyboard fallback. */
    import { SECTIONS } from "$lib/core/sections";
    import { studio } from "$lib/state/studio.svelte";
    import type { SectionId, StockInfo } from "$lib/core/types";

    let { stock }: { stock: StockInfo } = $props();

    let menuOpen = $state(false);

    function handleDragStart(event: DragEvent) {
        // SectionLane reads this back out in its drop handler. JSON rather than
        // just the ticker, so the lane does not have to look the stock up again.
        event.dataTransfer?.setData("application/json", JSON.stringify(stock));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    }

    function addTo(section: SectionId) {
        studio.addTrack(stock, section);
        menuOpen = false;
    }
</script>

<li draggable="true" ondragstart={handleDragStart}>
    <svg class="grip" viewBox="0 0 14 20" aria-hidden="true">
        <circle cx="4" cy="4" r="1.6" />
        <circle cx="10" cy="4" r="1.6" />
        <circle cx="4" cy="10" r="1.6" />
        <circle cx="10" cy="10" r="1.6" />
        <circle cx="4" cy="16" r="1.6" />
        <circle cx="10" cy="16" r="1.6" />
    </svg>

    <span class="ticker">{stock.ticker}</span>
    <span class="company">{stock.name}</span>
    {#if stock.delisted}
        <span class="badge">Delisted</span>
    {/if}

    <!-- Drag and drop cannot be done from a keyboard, so this menu is the
         accessible way to add a stock to a section. -->
    <button
        class="menu-toggle"
        aria-expanded={menuOpen}
        aria-label="Add {stock.ticker} to a section"
        onclick={() => (menuOpen = !menuOpen)}
    >
        +
    </button>

    {#if menuOpen}
        <ul class="menu">
            {#each SECTIONS as section (section.id)}
                <li>
                    <button onclick={() => addTo(section.id)}>{section.name}</button>
                </li>
            {/each}
        </ul>
    {/if}
</li>

<style>
    li {
        /* Anchors the absolutely positioned menu below. */
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.625rem;
        min-height: 48px;
        padding: 0.5rem 0.625rem;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        cursor: grab;
    }

    li:active {
        cursor: grabbing;
    }

    .grip {
        width: 14px;
        height: 20px;
        flex-shrink: 0;
        fill: var(--muted);
    }

    .ticker {
        font-family: var(--font-mono);
        font-weight: 600;
        width: 48px;
        flex-shrink: 0;
    }

    .company {
        flex: 1;
        min-width: 0;
        font-size: 0.8125rem;
        color: var(--text-soft);
        /* Long names truncate rather than wrapping the row onto two lines. */
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .badge {
        background: var(--danger);
        color: var(--on-danger);
        border-radius: 5px;
        padding: 2px 6px;
        font-size: 0.625rem;
        font-weight: 700;
        letter-spacing: 0.4px;
    }

    .menu-toggle {
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        background: transparent;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1;
    }

    .menu {
        position: absolute;
        right: 0.5rem;
        top: calc(100% - 4px);
        z-index: 2;
        list-style: none;
        padding: 0.25rem;
        background: var(--panel);
        border: 1px solid var(--border-strong);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .menu li {
        min-height: auto;
        padding: 0;
        background: none;
        border: 0;
        cursor: default;
    }

    .menu button {
        width: 100%;
        min-height: 36px;
        padding: 0 0.875rem;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--text);
        font-size: 0.875rem;
        text-align: left;
    }

    .menu button:hover {
        background: var(--card);
    }
</style>
