"""
Turning a price history into notes.

Everything here is a pure function: prices in, a list of timed notes out. No
database, no network. That makes it the easiest file to experiment with: change
a mapping, restart, and listen.

The timeline
------------
Daily closes are squashed into steps (one step = DAYS_PER_STEP trading days,
roughly a week). Each step lasts one 8th note at the track's BPM. A loop is
the whole history, padded with silence to a multiple of BAR_STEPS so every
loop restarts on a bar line.

Every note's time is in milliseconds from the start of the loop. The frontend
plays the loop, then starts again from 0.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Literal

STEPS_PER_BEAT = 2  # each step is an 8th note
BAR_STEPS = 16      # loops are padded to a multiple of this (2 bars of 4/4)

SectionId = Literal["piano", "guitar", "synth", "bass", "drums", "chords", "volatility"]

# Each section plays in one of these styles. Piano and synth both carry the
# tune; they're separate sections so instruments are easy to find, not
# because they play differently.
STYLE: dict[str, str] = {
    "piano": "tune",
    "synth": "tune",
    "guitar": "picking",
    "bass": "bass",
    "drums": "drums",
    "chords": "chords",
    "volatility": "volatility",
}

# The fingerpicking pattern for guitar, as scale degrees above the chord's
# root: root, third, fifth, octave, then back down. Eight steps = one bar.
PICKING = [0, 2, 4, 7, 4, 2, 4, 7]
KeyId = Literal["cmaj", "amin", "ddor", "ephr"]

# (root pitch class, scale intervals in semitones). C=0, D=2, E=4, A=9.
SCALES: dict[str, tuple[int, list[int]]] = {
    "cmaj": (0, [0, 2, 4, 5, 7, 9, 11]),  # major: bright
    "amin": (9, [0, 2, 3, 5, 7, 8, 10]),  # natural minor: moody
    "ddor": (2, [0, 2, 3, 5, 7, 9, 10]),  # dorian: minor with a raised 6th, funky
    "ephr": (4, [0, 1, 3, 5, 7, 8, 10]),  # phrygian: that flat 2nd, villain arc
}

KICK = 36  # MIDI C2. Gives the drum noise burst a low body.


def to_steps(closes: list[tuple[date, float]], days_per_step: int) -> list[tuple[date, float]]:
    """Keeps the last day of every chunk of `days_per_step` days, plus the final day."""
    if not closes:
        return []
    steps = closes[days_per_step - 1 :: days_per_step]
    if not steps or steps[-1] != closes[-1]:
        steps.append(closes[-1])
    return steps


def pitch(key: str, degree: int, octave: int) -> int:
    """
    MIDI note number for a scale degree. Degree 0 is the key's root; 7 is the
    root an octave up. Keys with a high root (A, for A minor) are dropped an
    octave so every key sits in roughly the same register.
    """
    root, intervals = SCALES[key]
    base = 12 * (octave + 1) + root
    if root >= 7:
        base -= 12
    return base + intervals[degree % 7] + 12 * (degree // 7)


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(fraction * len(ordered)))]


def build_schedule(prices: list[float], section: SectionId, key: KeyId, bpm: int) -> dict:
    """The notes for one stock in one section, as a loop of timed events."""
    step_ms = 60_000 / bpm / STEPS_PER_BEAT
    count = len(prices)
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

    # Log prices: over ten years a stock can grow tenfold, and on a linear
    # scale the early years would all squash onto the bottom note. On a log
    # scale a doubling moves the pitch by the same amount wherever it happens.
    logs = [math.log(max(p, 0.01)) for p in prices]
    low, high = min(logs), max(logs)
    span = (high - low) or 1.0
    level = [(v - low) / span for v in logs]  # 0 = lowest price ever, 1 = highest

    # Size of each step's move. Thresholds are percentiles of THIS stock's moves,
    # so a calm utility and a meme stock both get dynamics, relative to their
    # own normal: the top 3% of a stock's weeks are big moves for that stock.
    moves = [0.0] + [abs(prices[i] / prices[i - 1] - 1) for i in range(1, count)]
    typical = percentile(moves, 0.5) or 1e-9
    big = percentile(moves, 0.9) or 1e-9
    huge = percentile(moves, 0.97) or 1e-9

    notes: list[dict] = []
    style = STYLE[section]

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
        return sum(chunk) / len(chunk)

    if style == "tune":
        # The price line becomes the tune: two octaves, low price = low note.
        # A repeated note on an off-beat is held instead of replayed, which
        # leaves gaps and stops the melody being a wall of 8th notes.
        previous = None
        for i in range(count):
            degree = round(level[i] * 14)
            if degree == previous and i % 2 == 1:
                continue
            add(i, pitch(key, degree, 4), 0.45 + 0.5 * min(1, moves[i] / big), 0.9)
            previous = degree

    elif style == "picking":
        # Picks through the notes of a chord, one per step, like a fingerpicked
        # guitar. The chord follows the average price over each bar, so it
        # moves with the stock without jumping around every week. Notes ring
        # on into the next, and the beat gets a little extra weight.
        for i in range(count):
            bar = i - i % 8
            root = round(window_average(level, bar, 8) * 7)
            accent = 0.15 if i % 4 == 0 else 0.0
            add(i, pitch(key, root + PICKING[i % 8], 3), 0.45 + accent + 0.3 * min(1, moves[i] / big), 1.8)

    elif style == "bass":
        # Every half bar, the root of the average price over the last 8 steps.
        # Averaging smooths week-to-week noise, so the bass moves like a bass.
        for i in range(0, count, 4):
            avg = window_average(level, max(0, i - 7), 8)
            add(i, pitch(key, round(avg * 7), 2), 0.75, 3.6)

    elif style == "drums":
        # A steady kick on the beat, plus a hat on any week busier than usual,
        # louder the bigger the move.
        for i in range(count):
            if i % 4 == 0:
                add(i, KICK, 0.85, 1)
            elif moves[i] > typical:
                add(i, None, 0.3 + 0.6 * min(1, moves[i] / huge), 0.5)

    elif style == "chords":
        # One chord per bar (root, third, fifth), on the average price of that
        # bar, louder when the bar was turbulent.
        for i in range(0, count, BAR_STEPS):
            root = round(window_average(level, i, BAR_STEPS) * 7)
            turbulence = window_average(moves, i, BAR_STEPS) / big
            velocity = 0.25 + 0.35 * min(1, turbulence)
            for third in (0, 2, 4):
                add(i, pitch(key, root + third, 3), velocity, BAR_STEPS)

    elif style == "volatility":
        # Silent most of the time: only the biggest moves (top 3%) make a sound.
        for i in range(count):
            if moves[i] >= huge and moves[i] > 0:
                add(i, pitch(key, round(level[i] * 7) + 7, 4), 0.9, 2)

    schedule["notes"] = notes
    return schedule
