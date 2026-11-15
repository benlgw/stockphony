<script lang="ts">
    import { studio } from "$lib/state/studio.svelte";

    // A lookup rather than an if-chain: one line per state, and TypeScript
    // checks that every BackendState has a label.
    const LABELS = {
        checking: "Connecting…",
        online: "Backend connected",
        offline: "Backend offline",
    } as const;

    const label = $derived(LABELS[studio.backend]);

    // Generated prices are useful for building without internet, but a demo
    // should never run on them by accident, so they get a visible warning.
    const fakeData = $derived(studio.backend === "online" && studio.priceSource === "fake");
</script>

<footer>
    <span class="dot" class:is-live={studio.backend === "online"} class:is-down={studio.backend === "offline"}></span>
    <span>{label}</span>
</footer>

{#if fakeData}
    <p class="warning">Using generated prices (PRICE_SOURCE=fake), not real market data.</p>
{/if}

{#if studio.backend === "offline"}
    <p class="warning">Start it from backend/ with: uv run uvicorn app.main:app --reload</p>
{/if}

<style>
    footer {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border);
        font-size: 0.75rem;
        color: var(--muted);
    }

    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--muted);
    }

    .is-live {
        background: var(--accent);
    }

    .is-down {
        background: var(--danger);
    }

    .warning {
        font-size: 0.75rem;
        color: var(--danger);
    }
</style>
