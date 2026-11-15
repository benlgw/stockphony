"""Turn historical stock prices into a timed musical schedule.

This version keeps Stockphony's existing public interface and five musical
sections, but adds a differentiable trend model:

1. Fit a low-degree polynomial to log closing prices.
2. Differentiate that fitted function (JAX when installed).
3. Use the first derivative to drive melody direction/register.
4. Use the second derivative to trigger occasional vocal accents.

The polynomial is a descriptive smoothing model, NOT a prediction of future
stock prices. The original price-level mapping remains useful for bass/pads.
"""

from __future__ import annotations

import math
import warnings
from datetime import date
from typing import Literal

import numpy as np

try:  # JAX is optional so the backend still runs before it is installed.
    import jax
    import jax.numpy as jnp
    JAX_AVAILABLE = True
except ImportError:  # pragma: no cover - depends on local environment
    jax = None
    jnp = None
    JAX_AVAILABLE = False

STEPS_PER_BEAT = 2
BAR_STEPS = 16
SectionId = Literal["melody", "bass", "drums", "pads", "vocals"]
KeyId = Literal["cmaj", "amin", "ddor", "ephr"]

SCALES: dict[str, tuple[int, list[int]]] = {
    "cmaj": (0, [0, 2, 4, 5, 7, 9, 11]),
    "amin": (9, [0, 2, 3, 5, 7, 8, 10]),
    "ddor": (2, [0, 2, 3, 5, 7, 9, 10]),
    "ephr": (4, [0, 1, 3, 5, 7, 8, 10]),
}

KICK = 36


def to_steps(closes: list[tuple[date, float]], days_per_step: int) -> list[tuple[date, float]]:
    """Keep the last close in each chunk, plus the final close."""
    if days_per_step < 1:
        raise ValueError("days_per_step must be at least 1")
    if not closes:
        return []
    steps = closes[days_per_step - 1 :: days_per_step]
    if not steps or steps[-1] != closes[-1]:
        steps.append(closes[-1])
    return steps


def pitch(key: str, degree: int, octave: int) -> int:
    """Return a MIDI note for a scale degree (including degrees outside one octave)."""
    if key not in SCALES:
        raise ValueError(f"Unknown key: {key}")
    root, intervals = SCALES[key]
    base = 12 * (octave + 1) + root
    if root >= 7:
        base -= 12
    return base + intervals[degree % 7] + 12 * (degree // 7)


def percentile(values: list[float], fraction: float) -> float:
    """A small dependency-free percentile helper."""
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(fraction * len(ordered))))
    return ordered[index]


def analyse_prices(prices: list[float]) -> dict[str, list[float] | str]:
    """Fit a cubic (or lower-degree) polynomial to log prices and differentiate it.

    Time is centred/scaled before fitting for numerical stability. Derivatives
    are converted back to units of log-price per Stockphony step.
    JAX performs the differentiation when available; NumPy's polynomial
    derivative is a mathematically equivalent fallback.
    """
    if not prices:
        return {"fitted_log": [], "gradient": [], "acceleration": [], "method": "none"}

    safe_prices = np.maximum(np.asarray(prices, dtype=float), 0.01)
    log_prices = np.log(safe_prices)
    count = len(log_prices)

    if count == 1:
        return {
            "fitted_log": [float(log_prices[0])],
            "gradient": [0.0],
            "acceleration": [0.0],
            "method": "constant",
        }

    # A cubic needs at least four observations. Lower degree avoids an
    # underdetermined fit for short histories.
    degree = min(3, count - 1)
    raw_time = np.arange(count, dtype=float)
    time_mean = float(raw_time.mean())
    time_scale = float(raw_time.std()) or 1.0
    x = (raw_time - time_mean) / time_scale

    with warnings.catch_warnings():
        rank_warning = getattr(np, "RankWarning", Warning)
        warnings.simplefilter("ignore", rank_warning)
        coefficients = np.polyfit(x, log_prices, degree)

    if JAX_AVAILABLE:
        # JAX differentiates the fitted polynomial, not the raw noisy samples.
        coeffs_jax = jnp.asarray(coefficients)

        def model(x_value):
            return jnp.polyval(coeffs_jax, x_value)

        first = jax.grad(model)
        second = jax.grad(first)
        x_jax = jnp.asarray(x)
        fitted = np.asarray(jax.vmap(model)(x_jax), dtype=float)
        gradient_x = np.asarray(jax.vmap(first)(x_jax), dtype=float)
        acceleration_x = np.asarray(jax.vmap(second)(x_jax), dtype=float)
        method = "jax"
    else:
        fitted = np.polyval(coefficients, x)
        gradient_x = np.polyval(np.polyder(coefficients, 1), x)
        acceleration_x = np.polyval(np.polyder(coefficients, 2), x)
        method = "numpy-fallback"

    # Chain rule: x = (t - mean) / scale.
    gradient = gradient_x / time_scale
    acceleration = acceleration_x / (time_scale ** 2)

    return {
        "fitted_log": fitted.tolist(),
        "gradient": gradient.tolist(),
        "acceleration": acceleration.tolist(),
        "method": method,
    }


def build_schedule(prices: list[float], section: SectionId, key: KeyId, bpm: int) -> dict:
    """Create timed note events for one stock and one musical section.

    The function signature and returned schedule shape remain compatible with
    the existing FastAPI endpoint and frontend.
    """
    if bpm <= 0:
        raise ValueError("bpm must be positive")
    if key not in SCALES:
        raise ValueError(f"Unknown key: {key}")
    if section not in ("melody", "bass", "drums", "pads", "vocals"):
        raise ValueError(f"Unknown section: {section}")

    clean_prices = [max(float(p), 0.01) for p in prices]
    step_ms = 60_000 / bpm / STEPS_PER_BEAT
    count = len(clean_prices)
    loop_steps = max(BAR_STEPS, math.ceil(count / BAR_STEPS) * BAR_STEPS)

    schedule = {
        "section": section,
        "key": key,
        "bpm": bpm,
        "step_ms": step_ms,
        "loop_steps": loop_steps,
        "loop_ms": loop_steps * step_ms,
        "notes": [],
    }
    if count < 2:
        return schedule

    logs = [math.log(p) for p in clean_prices]
    low, high = min(logs), max(logs)
    span = (high - low) or 1.0
    level = [(value - low) / span for value in logs]

    # Signed log returns retain direction; absolute moves retain the old
    # volatility/dynamics behaviour.
    signed_returns = [0.0] + [
        math.log(clean_prices[i] / clean_prices[i - 1])
        for i in range(1, count)
    ]
    moves = [abs(value) for value in signed_returns]
    typical = percentile(moves, 0.5) or 1e-9
    big = percentile(moves, 0.9) or 1e-9
    huge = percentile(moves, 0.97) or 1e-9

    analysis = analyse_prices(clean_prices)
    gradient = analysis["gradient"]
    acceleration = analysis["acceleration"]
    assert isinstance(gradient, list) and isinstance(acceleration, list)

    # Robust scales prevent one extreme point dominating every musical event.
    gradient_scale = percentile([abs(v) for v in gradient], 0.75) or 1e-9
    acceleration_scale = percentile([abs(v) for v in acceleration], 0.90) or 1e-9

    notes: list[dict] = []

    def add(step: int, midi: int | None, velocity: float, length_steps: float) -> None:
        notes.append({
            "step": step,
            "time_ms": round(step * step_ms, 2),
            "pitch": midi,
            "velocity": round(min(1.0, max(0.05, velocity)), 3),
            "duration_ms": round(length_steps * step_ms, 2),
        })

    def window_average(values: list[float], start: int, size: int) -> float:
        chunk = values[start : start + size]
        return sum(chunk) / len(chunk) if chunk else 0.0

    if section == "melody":
        # Derivative-driven melody: negative trends sit lower, positive trends
        # sit higher, and stronger trends move farther from the middle register.
        # tanh smoothly limits the result to the two-octave scale range.
        previous_degree = None
        for i in range(count):
            strength = math.tanh(gradient[i] / gradient_scale)
            degree = max(0, min(14, 7 + round(7 * strength)))

            # Preserve a little rhythmic space when adjacent notes repeat.
            if degree == previous_degree and i % 2 == 1:
                continue

            velocity = 0.4 + 0.45 * min(1.0, moves[i] / big)
            add(i, pitch(key, degree, 4), velocity, 0.9)
            previous_degree = degree

    elif section == "bass":
        # Retain the original price-level bass: it anchors the piece to the
        # stock's longer-term position rather than its short-term direction.
        for i in range(0, count, 4):
            avg = window_average(level, max(0, i - 7), 8)
            add(i, pitch(key, round(avg * 7), 2), 0.75, 3.6)

    elif section == "drums":
        # Retain the steady kick and movement-triggered hats.
        for i in range(count):
            if i % 4 == 0:
                add(i, KICK, 0.85, 1)
            elif moves[i] > typical:
                add(i, None, 0.3 + 0.6 * min(1.0, moves[i] / huge), 0.5)

    elif section == "pads":
        # Retain the original bar-level harmony and turbulence dynamics.
        for i in range(0, count, BAR_STEPS):
            root = round(window_average(level, i, BAR_STEPS) * 7)
            turbulence = window_average(moves, i, BAR_STEPS) / big
            velocity = 0.25 + 0.35 * min(1.0, turbulence)
            for chord_degree in (0, 2, 4):
                add(i, pitch(key, root + chord_degree, 3), velocity, BAR_STEPS)

    elif section == "vocals":
        # Acceleration accents: sing when the fitted trend changes unusually
        # quickly. This complements, rather than duplicates, the movement drums.
        for i in range(count):
            if abs(acceleration[i]) >= acceleration_scale and abs(acceleration[i]) > 0:
                degree = 7 + (3 if acceleration[i] > 0 else -3)
                add(i, pitch(key, degree, 4), 0.82, 2)

    schedule["notes"] = notes
    return schedule
