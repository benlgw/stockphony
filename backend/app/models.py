"""
The shapes of every response, as Pydantic models.

FastAPI uses these to validate what we return, and to generate the docs at
/docs. Python code uses snake_case; the JSON uses camelCase (stepMs, timeMs)
to match the frontend's TypeScript. The alias generator below converts
between the two automatically.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from .music import KeyId, SectionId


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class StockInfo(ApiModel):
    ticker: str
    name: str
    delisted: bool


class Point(ApiModel):
    date: date
    close: float


class History(ApiModel):
    ticker: str
    # One point per musical step (about a week), so the chart and the notes
    # share an index: note.step N is points[N].
    days_per_step: int
    points: list[Point]


class Note(ApiModel):
    step: int
    time_ms: float          # from the start of the loop
    pitch: int | None       # MIDI note number; None = unpitched (drums)
    velocity: float         # 0-1
    duration_ms: float


class NoteSchedule(ApiModel):
    ticker: str
    section: SectionId
    key: KeyId
    bpm: int
    step_ms: float
    loop_steps: int
    loop_ms: float
    notes: list[Note]


class Health(ApiModel):
    ok: bool
    price_source: str
    database: bool
