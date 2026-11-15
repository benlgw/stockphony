<script lang="ts">
  /**
   * The price chart: a grey line for the whole history, the section colour for
   * the part already played, and a vertical playhead.
   *
   * Two things worth knowing:
   *
   * 1. Prices are plotted on a LOG scale. Over a full history a share can grow
   *    a hundredfold, and on a linear scale the first twenty years flatten into
   *    the bottom pixel. On a log scale, a doubling looks the same wherever it
   *    happens.
   *
   * 2. The history is downsampled before drawing. 11,000 points would be 11,000
   *    numbers in the `points` attribute, re-parsed on every redraw, for a line
   *    600 pixels wide. MAX_CHART_POINTS is more than enough to look identical.
   */
  import { MAX_CHART_POINTS } from "$lib/core/config";
  import type { Point } from "$lib/core/types";

  let {
    points,
    playhead,
    error = null,
  }: { points: Point[]; playhead: number; error?: string | null } = $props();

  // A fixed drawing grid; the SVG scales to its container via viewBox.
  const WIDTH = 600;
  const HEIGHT = 80;

  /**
   * Converts the history into screen coordinates once per data change.
   * $derived.by is for derived values that need a function body rather than
   * a single expression.
   */
  const shape = $derived.by(() => {
    if (points.length < 2) return null;

    const logs = points.map((p) => Math.log(Math.max(p.close, 0.01)));
    const min = Math.min(...logs);
    const max = Math.max(...logs);
    const span = max - min || 1;

    const step = Math.max(1, Math.ceil(points.length / MAX_CHART_POINTS));
    const coords: { index: number; x: number; y: number }[] = [];
    for (let i = 0; i < points.length; i += step) {
      coords.push({
        index: i,
        x: (i / (points.length - 1)) * WIDTH,
        // SVG y grows downwards, so the value is subtracted from the height.
        y: HEIGHT - 4 - ((logs[i] - min) / span) * (HEIGHT - 8),
      });
    }
    return { coords, min, span };
  });

  const full = $derived(shape ? shape.coords.map((c) => `${c.x},${c.y}`).join(' ') : '');

  /** Index of the playhead, clamped so a stale value cannot run off the end. */
  const head = $derived(Math.min(Math.max(playhead, 0), Math.max(points.length - 1, 0)));

  const headX = $derived(points.length > 1 ? (head / (points.length - 1)) * WIDTH : 0);

  /**
   * The played portion. The exact playhead position is appended so the coloured
   * line always reaches the marker, even though the drawn points are sampled.
   */
  const played = $derived.by(() => {
    if (!shape) return '';
    const upTo = shape.coords.filter((c) => c.index <= head).map((c) => `${c.x},${c.y}`);
    if (upTo.length === 0) return '';
    const current = points[head];
    const y =
      HEIGHT - 4 - ((Math.log(Math.max(current.close, 0.01)) - shape.min) / shape.span) * (HEIGHT - 8);
    return [...upTo, `${headX},${y}`].join(' ');
  });
</script>

<div class="chart">
  {#if shape}
    <!--
      preserveAspectRatio="none" lets the chart stretch to whatever width the
      card has. Lines use vector-effect so they keep an even thickness despite
      that stretching.
    -->
    <svg viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="line line--base" points={full} />
      <polyline class="line line--played" points={played} />
      <line class="playhead" x1={headX} x2={headX} y1="0" y2={HEIGHT} />
    </svg>
  {:else}
    <!-- With no chart to draw, show why: an error if there is one, otherwise still loading. -->
    <p class="loading" class:is-error={error}>{error ?? "Loading price history…"}</p>
  {/if}
</div>

<style>
  .chart {
    flex: 1 1 auto;
    display: flex;
    min-height: 120px;
    background: var(--bg);
    border-radius: 12px;
    padding: 8px;
  }

  svg {
    width: 100%;
    height: 100%;
    min-height: 104px;
  }

  .line {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
    /* Keeps stroke width constant even though the viewBox is stretched. */
    vector-effect: non-scaling-stroke;
  }

  .line--base {
    stroke: var(--chart-base);
    stroke-width: 2;
  }

  /* Inherited from the enclosing .lane--* class, so each section draws in its own colour. */
  .line--played {
    stroke: var(--section-color);
    stroke-width: 2.5;
  }

  .playhead {
    stroke: var(--text);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .loading {
    margin: auto;
    font-size: 13px;
    color: var(--muted);
  }

  /* Two classes, so it outranks .loading's colour whatever the order. */
  .loading.is-error {
    color: var(--danger);
  }
</style>
