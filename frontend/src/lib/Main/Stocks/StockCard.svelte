<script lang="ts">
    /**
     * One stock in the mix: instrument and key on the left; chart, tempo and
     * volume filling the rest of the row.
     */
    import { LEVERAGE_OPTIONS, MAX_BPM, MIN_BPM } from "$lib/core/config";
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

    /** The tempo it actually plays at, shown beside the BPM slider. */
    const effectiveBpm = $derived(track.bpm * track.leverage);
</script>

<!-- The id lets the search scroll a newly added stock into view. -->
<article class="card" id="card-{track.ticker}">
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
        <!-- The chart shares a row with a narrow column of controls, so it can
             use the card's full height instead of sitting under a header row. -->
        <div class="chart-row">
            <PriceChart {points} {playhead} {error} />

            <div class="side">
                <button
                    class="remove"
                    onclick={() => studio.removeTrack(track.ticker)}
                    aria-label="Remove {track.ticker} from the mix"
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>

                <!--
                  Real radio buttons, styled as a column of buttons. Using native
                  inputs means keyboard support comes free: Tab reaches the group
                  and the arrow keys move between options.
                -->
                <fieldset class="leverage">
                    <legend class="visually-hidden">Leverage for {track.ticker}</legend>
                    {#each LEVERAGE_OPTIONS as option (option)}
                        <label class:is-selected={track.leverage === option}>
                            <input
                                type="radio"
                                name="leverage-{track.ticker}"
                                value={option}
                                checked={track.leverage === option}
                                onchange={() => studio.updateTrack(track.ticker, { leverage: option })}
                            />
                            {option}×
                        </label>
                    {/each}
                </fieldset>
            </div>
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
            <span class="value" class:is-leveraged={track.leverage > 1}>{effectiveBpm}</span>

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
       (the default) makes the chart as tall as the row. */
    .chart-row {
        flex: 1 1 auto;
        display: flex;
        gap: 0.75rem;
        min-height: 0;
    }

    /* The column beside the chart: remove button on top, leverage below it.
       Fixed width so every card's chart ends at the same x. */
    .side {
        flex: 0 0 44px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .remove {
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

    /* Three columns: label, slider, value. "auto" sizes the label column to
       the wider label, so both slider tracks start at the same x. The value
       column is 40px so a leveraged tempo like 1200 fits. */
    .sliders {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) 40px;
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

    /* Leveraged tempos stand out, since they can be 10x the slider. */
    .value.is-leveraged {
        color: var(--accent);
        font-weight: 600;
    }

    .leverage {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 2px;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        background: var(--bg);
    }

    .leverage label {
        position: relative;
        padding: 3px 0;
        border-radius: 6px;
        font-family: var(--font-mono);
        text-align: center;
        cursor: pointer;
    }

    /* The radio circle is hidden but still there, stretched over its label:
       it stays clickable and focusable, the label provides the look. */
    .leverage input {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: pointer;
    }

    .leverage label.is-selected {
        background: var(--accent);
        color: var(--on-accent);
    }

    /* The input is invisible, so its keyboard focus ring goes on the label. */
    .leverage label:has(input:focus-visible) {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
    }

    /* Hidden on screen, still read out by screen readers. */
    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    /* Phone layout: 760px and narrower. Every component uses this same breakpoint. */
    @media (max-width: 760px) {
        /* Everything stacks: name, then instrument and key side by side,
           then the chart, the leverage row, and the sliders. */
        .card {
            flex-direction: column;
            gap: 0.875rem;
            padding: 0.875rem;
        }

        .settings {
            flex: none;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.625rem;
        }

        .identity {
            grid-column: 1 / -1;
        }

        /* iPhones zoom the whole page into any form field whose text is
           under 16px when it's tapped. 16px stops that. */
        select {
            font-size: 16px;
        }

        .chart-row {
            flex-direction: column;
        }

        /* The cross and leverage buttons become one row under the chart:
           row-reverse puts the cross on the right, leverage on the left. */
        .side {
            flex: none;
            flex-direction: row-reverse;
            justify-content: space-between;
            align-items: center;
        }

        .leverage {
            flex-direction: row;
        }

        .leverage label {
            padding: 8px 12px;
        }
    }
</style>
