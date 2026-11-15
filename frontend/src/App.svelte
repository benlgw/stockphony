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
</style>
