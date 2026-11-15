<script lang="ts">
    /**
     * One stock in the mix: instrument and key on the left; chart, tempo and
     * volume filling the rest of the row.
     */
    import { MAX_BPM, MIN_BPM } from "$lib/core/config";
    import { KEYS } from "$lib/core/sections";
    import type { SectionDef } from "$lib/core/sections";
    import { studio } from "$lib/state/studio.svelte";
    import type { KeyId, Track } from "$lib/core/types";
    import PriceChart from "./PriceChart.svelte";

    let { track, section }: { track: Track; section: SectionDef } = $props();

    // Reading from the studio's raw-state records keeps these current as
    // history and note messages arrive.
    const points = $derived(studio.history[track.ticker] ?? []);
    const playhead = $derived(studio.playheads[track.ticker] ?? 0);
    // e.g. "No price history for LEH": shown in place of the chart.
    const error = $derived(studio.trackErrors[track.ticker] ?? null);

    // $derived, not plain consts: Svelte reuses this component when the list
    // changes, and a const would keep the ticker it was first created with.
    const instrumentId = $derived(`instrument-${track.ticker}`);
    const keyId = $derived(`key-${track.ticker}`);
    const volumeId = $derived(`volume-${track.ticker}`);
    const bpmId = $derived(`bpm-${track.ticker}`);
</script>

<article class="card">
    <div class="settings">
        <div class="identity">
            <h3>{track.ticker}</h3>
            <div class="name-row">
                <span class="company">{track.name}</span>
                {#if track.delisted}
                    <span class="badge">Delisted</span>
                {/if}
            </div>
        </div>

        <div class="field">
            <label for={instrumentId}>Instrument</label>
            <select
                id={instrumentId}
                value={track.instrument}
                onchange={(event) =>
                    studio.updateTrack(track.ticker, {
                        instrument: event.currentTarget.value,
                    })}
            >
                {#each section.instruments as instrument (instrument)}
                    <option value={instrument}>{instrument}</option>
                {/each}
            </select>
        </div>

        <div class="field">
            <label for={keyId}>Key</label>
            <select
                id={keyId}
                value={track.key}
                disabled={!section.pitched}
                onchange={(event) =>
                    studio.updateTrack(track.ticker, {
                        key: event.currentTarget.value as KeyId,
                    })}
            >
                {#each KEYS as key (key.id)}
                    <option value={key.id}>{key.label}</option>
                {/each}
            </select>
            {#if !section.pitched}
                <!-- Drums have no pitch, so the picker above is disabled. -->
                <span class="hint">Unpitched</span>
            {/if}
        </div>
    </div>

    <div class="playback">
        <!-- The chart shares a row with the remove button, so it can use the
             card's full height instead of sitting under a header row. -->
        <div class="chart-row">
            <PriceChart {points} {playhead} {error} />
            <button
                class="remove"
                onclick={() => studio.removeTrack(track.ticker)}
                aria-label="Remove {track.ticker} from the mix"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </div>

        <!--
          Both sliders share one grid, so their tracks line up even though
          "BPM" and "Volume" are different widths.
        -->
        <div class="sliders">
            <!--
              oninput moves the number while dragging but tells only the screen
              (sync: false); onchange fires once on release and tells the backend.
              Volume does not need this split: it never leaves the browser.
            -->
            <label for={bpmId}>BPM</label>
            <input
                id={bpmId}
                type="range"
                min={MIN_BPM}
                max={MAX_BPM}
                value={track.bpm}
                oninput={(event) =>
                    studio.updateTrack(
                        track.ticker,
                        { bpm: Number(event.currentTarget.value) },
                        { sync: false },
                    )}
                onchange={(event) =>
                    studio.updateTrack(track.ticker, {
                        bpm: Number(event.currentTarget.value),
                    })}
            />
            <span class="value">{track.bpm}</span>

            <label for={volumeId}>Volume</label>
            <input
                id={volumeId}
                type="range"
                min="0"
                max="100"
                value={track.volume}
                oninput={(event) =>
                    studio.updateTrack(track.ticker, {
                        volume: Number(event.currentTarget.value),
                    })}
            />
            <span class="value">{track.volume}</span>
        </div>
    </div>
</article>

<style>
    .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 1rem;
        display: flex;
        gap: 1.125rem;
        align-items: stretch;
    }

    .settings {
        /* Fixed width so every card's controls line up down the lane. */
        flex: 0 0 180px;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
    }

    h3 {
        font-family: var(--font-mono);
        font-size: 1.25rem;
        font-weight: 600;
    }

    .name-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.375rem;
        margin-top: 0.25rem;
    }

    .company {
        font-size: 0.875rem;
        color: var(--text-soft);
    }

    .badge {
        background: var(--danger);
        color: var(--on-danger);
        border-radius: 6px;
        padding: 3px 7px;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.4px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    label {
        font-size: 0.75rem;
        color: var(--muted);
    }

    select {
        min-height: 44px;
        width: 100%;
        background: var(--bg);
        color: var(--text);
        border: 1px solid var(--border-strong);
        border-radius: 10px;
        padding: 0 0.5rem;
        font-size: 0.875rem;
    }

    select:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .hint {
        font-size: 0.75rem;
        color: var(--muted);
    }

    /* min-width: 0 lets the chart shrink; without it a flex child refuses to
       go below its content width and the card overflows. */
    .playback {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
    }

    /* Grows to fill whatever height the sliders leave. align-items: stretch
       (the default) makes the chart as tall as the row; the button opts out
       with align-self so it stays a 44px square in the top corner. */
    .chart-row {
        flex: 1 1 auto;
        display: flex;
        gap: 0.75rem;
        min-height: 0;
    }

    .remove {
        align-self: flex-start;
        width: 44px;
        height: 44px;
        flex-shrink: 0;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: transparent;
        color: var(--muted);
        display: grid;
        place-items: center;
    }

    .remove:hover {
        color: var(--danger);
        border-color: var(--danger);
    }

    .remove svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
    }

    /* Three columns: label, slider, value. "auto" sizes the label column to the
       wider of the two labels, so both slider tracks start at the same x. */
    .sliders {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) 32px;
        align-items: center;
        column-gap: 0.75rem;
        row-gap: 0.5rem;
    }

    .sliders input {
        width: 100%;
    }

    .value {
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        text-align: right;
    }
</style>
