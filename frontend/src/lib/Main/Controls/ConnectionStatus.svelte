<script lang="ts">
    import { studio } from "$lib/state/studio.svelte";

    // A lookup rather than an if-chain: one line per state, and TypeScript
    // checks that every ConnectionState has a label.
    const LABELS = {
        open: "Connected",
        connecting: "Connecting…",
        closed: "Reconnecting…",
        mock: "Demo data",
    } as const;

    const label = $derived(LABELS[studio.connection]);
</script>

<footer>
    <span class="dot" class:is-live={studio.connection === "open"}></span>
    <span>{label}</span>
</footer>

{#if studio.lastError}
    <!-- Errors from the backend are shown, not swallowed into the console. -->
    <p class="error">{studio.lastError}</p>
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

    .error {
        font-size: 0.75rem;
        color: var(--danger);
    }
</style>
