<script lang="ts">
    import { studio } from "$lib/state/studio.svelte";
</script>

<!--
  Tempo is set by hand, not derived from the data: the backend only gets new
  prices every few minutes, so a data-driven BPM would barely move.

  oninput rather than onchange, so the number updates as the slider is dragged
  instead of only when it is released.
-->
<div class="tempo">
    <label for="bpm">BPM</label>
    <input
        id="bpm"
        type="range"
        min="60"
        max="200"
        value={studio.bpm}
        oninput={(event) => studio.setTempo(Number(event.currentTarget.value))}
    />
    <span class="value">{studio.bpm}</span>
</div>

<style>
    .tempo {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    label {
        font-size: 0.75rem;
        color: var(--muted);
        flex-shrink: 0;
    }

    input {
        flex: 1 1 auto;
        min-width: 0;
    }

    .value {
        font-family: var(--font-mono);
        font-size: 0.9375rem;
        font-weight: 600;
        width: 32px;
        text-align: right;
    }
</style>
