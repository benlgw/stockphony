<script lang="ts">
    import { studio } from "$lib/state/studio.svelte";
</script>

<!--
  Play and pause are separate buttons rather than one toggle, so during a demo
  nobody has to work out which state the button is currently showing.

  studio.play() starts the AudioContext, and browsers only allow that from a
  real user gesture, which is why it is wired straight to the click.
-->
<div class="transport" role="group" aria-label="Playback">
    <button class:is-active={studio.playing} onclick={() => studio.play()} aria-label="Play">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
    </button>

    <button class:is-active={!studio.playing} onclick={() => studio.pause()} aria-label="Pause">
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="4" width="5" height="16" rx="1.5" />
            <rect x="14" y="4" width="5" height="16" rx="1.5" />
        </svg>
    </button>

    <button onclick={() => studio.restart()} aria-label="Restart">
        <svg class="stroked" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
        </svg>
    </button>
</div>

<style>
    .transport {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
    }

    button {
        min-height: 48px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: transparent;
        color: var(--text);
        display: grid;
        place-items: center;
    }

    .is-active {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--on-accent);
    }

    svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
    }

    /* The restart arrow is drawn with strokes, not fills. */
    svg.stroked {
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }
</style>
