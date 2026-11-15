<script lang="ts">
    import { onMount } from "svelte";
    import Header from "./lib/Header.svelte";
    import Main from "./lib/Main.svelte";
    import { studio } from "$lib/state/studio.svelte";

    // Starts the note scheduler and the playhead loop, and checks the backend
    // is reachable. Done here, once, rather than inside Main, so nothing a
    // component re-renders can start a second copy.
    //
    // init() returns a cleanup function, and onMount runs it when the app
    // unmounts. Without that, Vite's hot reload would leave an extra timer
    // running on every save.
    onMount(() => studio.init());
</script>

<Header />
<Main />

<style>
    /* App-level layout. This was in Header.svelte, but the padding applies to
       the whole page, not just the header, so it belongs with the root. */
    :global(#app) {
        min-height: 100dvh;
        /* max-width plus auto margins instead of a fixed 15rem of padding:
           same look on a big screen, but it does not squeeze the lanes on a
           13-inch laptop. */
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 2rem 3rem;
    }

    /* A strip in the page colour, pinned to the top of the window. The stock
       cards scroll underneath it, so they disappear the same distance from
       the top as the control panel stops at, instead of at the very edge.
       pointer-events: none so it never blocks a click on anything below. */
    :global(body)::before {
        content: "";
        position: fixed;
        inset: 0 0 auto;
        height: var(--scroll-gap);
        background: var(--bg);
        z-index: 10;
        pointer-events: none;
    }

    /* Phone layout: 760px and narrower. Every component uses this same breakpoint. */
    @media (max-width: 760px) {
        :global(#app) {
            padding: 0 1rem calc(5.5rem + env(safe-area-inset-bottom, 0px));
        }
    }
</style>
