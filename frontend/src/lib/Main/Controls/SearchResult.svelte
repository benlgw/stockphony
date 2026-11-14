<script lang="ts">
    /** One row of the search results. Drag it into a section to add the stock. */
    import type { StockInfo } from "$lib/core/types";

    let { stock }: { stock: StockInfo } = $props();

    function handleDragStart(event: DragEvent) {
        // SectionLane reads this back out in its drop handler. JSON rather than
        // just the ticker, so the lane does not have to look the stock up again.
        event.dataTransfer?.setData("application/json", JSON.stringify(stock));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
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
</li>

<style>
    li {
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
</style>
