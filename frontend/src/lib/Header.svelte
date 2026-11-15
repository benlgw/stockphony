<script lang="ts">
    import logo from "../assets/stockphony-logo.png";
    import { ukDate } from "./header/date";
</script>

<header>
    <div class="brand">
        <img class="logo" src={logo} alt="" />
        <div class="project">
            <h1>Stockphony</h1>
            <p>A symphony from stock data</p>
        </div>
    </div>

    <p class="stock-history">
        Full history · data up to <span>{ukDate}</span>
    </p>
</header>

<style>
    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 0;
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 0.875rem;
    }

    /* The image is trimmed to the logo itself (no empty canvas around it),
       so a fixed height with automatic width shows all of it, undistorted. */
    .logo {
        height: 64px;
        width: auto;
    }

    h1 {
        font-size: 1.625rem;
        font-weight: 700;
        letter-spacing: -0.5px;
    }

    .project p {
        font-size: 0.875rem;
        color: var(--muted);
    }

    .stock-history {
        padding: 0.625rem 1rem;
        border: 1px solid var(--border);
        border-radius: 2rem;
        font-size: 0.875rem;
        color: var(--muted);
    }

    .stock-history span {
        font-weight: 600;
        color: var(--text);
    }
</style>
