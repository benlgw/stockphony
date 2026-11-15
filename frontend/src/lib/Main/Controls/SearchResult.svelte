<script lang="ts">
    /**
     * One row of the search results. How a stock gets added depends on the device:
     *  - laptops: drag it into a section
     *  - phones and tablets: tap it, then pick a section, because touch
     *    screens can't drag and drop
     */
    import { tick } from "svelte";
    import { SECTIONS } from "$lib/core/sections";
    import type { SectionId, StockInfo } from "$lib/core/types";
    import { preloadStock } from "$lib/services/api";
    import { device } from "$lib/state/device.svelte";
    import { studio } from "$lib/state/studio.svelte";

    let {
        stock,
        open,
        ontoggle,
        onadded,
    }: {
        stock: StockInfo;
        /** Whether this row's section picker is showing. StockSearch decides,
            so that opening one picker closes any other. */
        open: boolean;
        ontoggle: () => void;
        onadded: () => void;
    } = $props();

    function handleDragStart(event: DragEvent) {
        // SectionLane reads this back out in its drop handler. JSON rather than
        // just the ticker, so the lane does not have to look the stock up again.
        event.dataTransfer?.setData("application/json", JSON.stringify(stock));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";

        // Picking a stock up is a strong hint it's about to be added, so ask
        // the backend to start fetching its prices while it's being dragged.
        preloadStock(stock.ticker);
    }

    function toggle() {
        // Opening the picker is the same hint as starting a drag.
        if (!open) preloadStock(stock.ticker);
        ontoggle();
    }

    function handleKey(event: KeyboardEvent) {
        // role="button" promises Enter and Space work, like a real button.
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
        }
    }

    async function addTo(section: SectionId) {
        studio.addTrack(stock, section);
        onadded();
        // Wait for the new card to render, then bring it into view. On a phone
        // the sections are below the search, so otherwise the stock would
        // appear somewhere off screen with no sign anything happened.
        await tick();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document
            .getElementById(`card-${stock.ticker}`)
            ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
</script>

<li>
    <!--
      On touch screens the row acts as a button that opens the section picker.
      On laptops it's only draggable, so clicks do nothing, exactly as before.

      A div given role="button" rather than a real <button>: Firefox won't
      start a drag from inside a <button>, and this row must stay draggable.
    -->
    <!--
      svelte-ignore a11y_no_noninteractive_tabindex
      The checker can't see that tabindex is only set together with
      role="button" (both depend on device.touch), so it warns wrongly here.
    -->
    <div
        class="row"
        role={device.touch ? "button" : undefined}
        tabindex={device.touch ? 0 : undefined}
        aria-expanded={device.touch ? open : undefined}
        aria-label={device.touch ? `Add ${stock.ticker}, ${stock.name}` : undefined}
        draggable="true"
        ondragstart={handleDragStart}
        onclick={device.touch ? toggle : undefined}
        onkeydown={device.touch ? handleKey : undefined}
    >
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
    </div>

    {#if open && device.touch}
        <div class="picker" role="group" aria-label="Choose a section for {stock.ticker}">
            {#each SECTIONS as section (section.id)}
                <button class="choice choice--{section.id}" onclick={() => addTo(section.id)}>
                    <span class="dot" aria-hidden="true"></span>
                    {section.name}
                </button>
            {/each}
        </div>
    {/if}
</li>

<style>
    li {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        /* 48px rows in total: 46px here plus the list item's 1px borders. */
        min-height: 46px;
        padding: 0.5rem 0.625rem;
        border-radius: 10px;
        cursor: grab;
    }

    .row:active {
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

    /* The section picker: a grid of buttons under the row. */
    .picker {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.375rem;
        padding: 0 0.5rem 0.5rem;
    }

    .choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 44px;
        padding: 0 0.75rem;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        background: var(--bg);
        color: var(--text);
        font-size: 0.875rem;
        text-align: left;
    }

    .choice:hover {
        border-color: var(--choice-color);
    }

    .dot {
        width: 10px;
        height: 10px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--choice-color);
    }

    /* Each choice shows its section's colour, the same as the lane's. */
    .choice--piano { --choice-color: var(--piano); }
    .choice--guitar { --choice-color: var(--guitar); }
    .choice--synth { --choice-color: var(--synth); }
    .choice--bass { --choice-color: var(--bass); }
    .choice--drums { --choice-color: var(--drums); }
    .choice--chords { --choice-color: var(--chords); }
    .choice--volatility { --choice-color: var(--volatility); }

    /* The grip suggests dragging, which fingers can't do here. */
    @media (pointer: coarse) {
        .grip {
            display: none;
        }
    }
</style>
