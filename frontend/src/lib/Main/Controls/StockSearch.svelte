<script lang="ts">
    /**
     * Typo-tolerant stock search. The matching itself happens in Postgres;
     * this component debounces keystrokes, cancels stale requests and renders
     * whatever comes back.
     */
    import { debounce, searchStocks } from "$lib/services/search";
    import { studio } from "$lib/state/studio.svelte";
    import type { StockInfo } from "$lib/core/types";
    import SearchResult from "./SearchResult.svelte";

    let query = $state("");
    let results = $state<StockInfo[]>([]);
    let error = $state<string | null>(null);

    /** Lets a newer keystroke abort the request still in flight. */
    let inFlight: AbortController | null = null;

    async function run(term: string) {
        inFlight?.abort();
        inFlight = new AbortController();
        try {
            results = await searchStocks(term, inFlight.signal);
            error = null;
        } catch (cause) {
            // An abort is expected whenever the user keeps typing, so it is
            // not an error worth showing.
            if (cause instanceof DOMException && cause.name === "AbortError") return;
            error = "Could not reach the stock database.";
            results = [];
        }
    }

    const search = debounce(run);

    // Runs once on mount to fill the list, then again on every keystroke.
    $effect(() => {
        search(query);
    });

    /** Stocks already in the mix are hidden, so none can be added twice. */
    const available = $derived(results.filter((stock) => !studio.hasTrack(stock.ticker)));
</script>

<div class="search">
    <label for="stock-search">Search stocks</label>
    <div class="input-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
        </svg>
        <input
            id="stock-search"
            type="search"
            placeholder="Search by company or ticker"
            autocomplete="off"
            bind:value={query}
        />
    </div>

    {#if error}
        <p class="message is-error">{error}</p>
    {:else if available.length === 0}
        <p class="message">
            {query.trim() ? `Nothing matches “${query}”.` : "No stocks left to add."}
        </p>
    {:else}
        <p class="message">
            {query.trim() ? "Drag a stock into a section." : "Popular stocks. Drag one into a section."}
        </p>
    {/if}

    <ul>
        {#each available as stock (stock.ticker)}
            <SearchResult {stock} />
        {/each}
    </ul>
</div>

<style>
    .search {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }

    label {
        font-size: 0.75rem;
        color: var(--muted);
    }

    .input-wrap {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--bg);
        border: 1px solid var(--border-strong);
        border-radius: 12px;
        padding: 0 0.75rem;
    }

    svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        fill: none;
        stroke: var(--muted);
        stroke-width: 2;
        stroke-linecap: round;
    }

    input {
        flex: 1;
        min-width: 0;
        min-height: 44px;
        background: transparent;
        color: var(--text);
        border: 0;
        font-size: 0.9375rem;
    }

    input:focus {
        outline: none;
    }

    .message {
        font-size: 0.8125rem;
        color: var(--muted);
    }

    .is-error {
        color: var(--danger);
    }

    ul {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        /* The panel is sticky, so a long list scrolls inside it instead of
           pushing the transport buttons off screen. */
        max-height: 420px;
        overflow-y: auto;
    }
</style>
