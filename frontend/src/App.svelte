<script lang="ts">
    import { onMount } from "svelte";
    import Header from "./lib/Header.svelte";
    import Main from "./lib/Main.svelte";
    import { studio } from "$lib/state/studio.svelte";

    // The one place the WebSocket is opened. Doing it here rather than inside
    // Main means the connection survives anything Main re-renders, and there
    // is a single obvious place to look for it.
    onMount(() => {
        studio.connect();
        // Returning a cleanup function closes the socket when the app unmounts.
        // Without it, Vite's hot reload would leave sockets open on every save.
        return () => studio.disconnect();
    });
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
