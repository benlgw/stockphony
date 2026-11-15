<script lang="ts">
    /**
     * One lane of the mix (Melody, Bass, ...), and the drop target for stocks
     * dragged out of the search panel.
     */
    import type { SectionDef } from "$lib/core/sections";
    import { studio } from "$lib/state/studio.svelte";
    import type { StockInfo } from "$lib/core/types";
    import StockCard from "./StockCard.svelte";

    let { section }: { section: SectionDef } = $props();

    /** True while a drag is hovering over THIS lane, for the drop highlight. */
    let over = $state(false);

    const tracks = $derived(studio.tracksIn(section.id));

    function handleDragOver(event: DragEvent) {
        // Without preventDefault the browser rejects the drop: the default
        // behaviour of dragover is "I am not a valid drop target".
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        over = true;
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        over = false;

        // The payload the search result serialised when the drag started.
        const raw = event.dataTransfer?.getData("application/json");
        if (!raw) return;
        studio.addTrack(JSON.parse(raw) as StockInfo, section.id);
    }
</script>

<!--
  svelte-ignore a11y_no_static_element_interactions
  A lane is a drop zone, not a control, so it takes no focus and has no key
handler. Keyboard users add stocks with the + menu on each search result.
-->
<section
    class="lane lane--{section.id}"
    class:is-over={over}
    ondragover={handleDragOver}
    ondragleave={() => (over = false)}
    ondrop={handleDrop}
    aria-label="{section.name} section"
>
    <header>
        <span class="swatch"></span>
        <h2>{section.name}</h2>
        <span class="count">
            {tracks.length}
            {tracks.length === 1 ? "stock" : "stocks"}
        </span>
    </header>

    {#if tracks.length === 0}
        <p class="empty">Drag a stock in from the search.</p>
    {:else}
        {#each tracks as track (track.ticker)}
            <StockCard {track} {section} />
        {/each}
    {/if}
</section>

<style>
    .lane {
        background: var(--lane);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        transition:
            border-color 0.12s ease,
            background 0.12s ease;
    }

    /*
     * Each lane declares its own --section-color, and every child inherits it.
     * That is why StockCard and PriceChart can draw in the right colour without
     * being told which section they are in.
     */
    .lane--piano {
        --section-color: var(--piano);
    }
    .lane--guitar {
        --section-color: var(--guitar);
    }
    .lane--synth {
        --section-color: var(--synth);
    }
    .lane--bass {
        --section-color: var(--bass);
    }
    .lane--drums {
        --section-color: var(--drums);
    }
    .lane--chords {
        --section-color: var(--chords);
    }
    .lane--volatility {
        --section-color: var(--volatility);
    }

    .is-over {
        border-color: var(--section-color);
        border-style: dashed;
    }

    header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 32px;
    }

    .swatch {
        width: 12px;
        height: 32px;
        border-radius: 6px;
        background: var(--section-color);
    }

    h2 {
        font-size: 1.25rem;
    }

    .count {
        font-size: 0.8125rem;
        color: var(--muted);
    }

    .empty {
        border: 1px dashed var(--border-strong);
        border-radius: 16px;
        padding: 1.375rem;
        text-align: center;
        font-size: 0.875rem;
        color: var(--muted);
    }

    /* Phone layout: 760px and narrower. Every component uses this same breakpoint. */
    @media (max-width: 760px) {
        .lane {
            padding: 0.75rem;
            border-radius: 18px;
        }
    }
</style>
