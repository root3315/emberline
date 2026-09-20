"""
The weather of the week being predicted, as features.

── Which weather, and why it matters which ────────────────────────────────

There are two weathers a fire model could be told about, and they are not
the same question.

The weather *before* the day of the forecast — how long since it rained,
how dry the month has been — describes the fuel. It is knowable at the
moment of prediction, and it is the safer thing to use.

The weather *during* the week being forecast — will it rain on Thursday,
will Friday be hot and windy — describes the trigger. It is the reason
this whole exercise is worth doing, because it is most of what separates
next week from the seasonal average, and it is the half the model cannot
get from the fire archive at any resolution.

This builds the second. The archive supplies it exactly for the training
years, because those weeks have already happened; the live map gets it
from a real forecast.

── The honesty this costs ─────────────────────────────────────────────────

Training on the weather that actually occurred and predicting with a
forecast of it are not the same conditions. A model scored this way is
being asked "how well could you do if the weather forecast were right",
which is an upper bound, not a promise. GFS is good at seven days and not
perfect, and the page has to say so rather than quietly bank the
difference. It is still the right thing to measure first: if perfect
weather buys nothing, imperfect weather certainly will not.

── The grid ───────────────────────────────────────────────────────────────

A degree and a half, which is where the public ERA5 mirror is readable in
bulk, and where the GFS side is reduced to match. Fire weather is synoptic
and mostly survives it; a mountain valley does not, and that is written
down in `fetch_arco.py` rather than hidden.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np

HOME = Path("models/weather")
STATIC = Path("models/weather-static.npz")

# A day drier than this is a dry day. One millimetre is the threshold the
# fire-weather literature settles on: less than that evaporates before it
# reaches anything that burns.
DRY_MM = 1.0

COLUMNS = [
    # ── over the window being forecast ───────────────────────────────────
    "w_tmax",  # the hottest day of it
    "w_rain",  # everything that falls across it
    "w_wind",  # the hardest it blows
    "w_dry",   # how many of its days stay under a millimetre
    # ── and what is standing there to burn ───────────────────────────────
    "veg_low",
    "veg_high",
]


class Weather:
    """
    The archive, memory-mapped, sliced to whatever cells are asked for.

    Nothing is read until a tile asks for its own corner of the planet, and
    then only that corner. The whole record is one and a quarter gigabytes;
    a ten-degree tile needs about fifty cells of it.
    """

    def __init__(self, horizon: int) -> None:
        meta = json.loads((HOME / "meta.json").read_text(encoding="utf-8"))
        self.first = date.fromisoformat(meta["first"])
        self.days = int(meta["days"])
        self.degrees = float(meta["degrees"])
        self.horizon = horizon

        self.tmax = np.load(HOME / "tmax.npy", mmap_mode="r")
        self.wind = np.load(HOME / "wind.npy", mmap_mode="r")
        self.rain = np.load(HOME / "rain.npy", mmap_mode="r")
        self.n_lon, self.n_lat = self.tmax.shape[1], self.tmax.shape[2]

        fixed = np.load(STATIC)
        # The static fields come off the same mirror on the same grid and in
        # the same order as the moving ones — (longitude, latitude), latitude
        # counting up from the south pole — so they need no turning.
        self.veg_low = np.asarray(fixed["low_vegetation_cover"], dtype=np.float32)
        self.veg_high = np.asarray(fixed["high_vegetation_cover"], dtype=np.float32)

    def index_of(self, lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Which weather cell a fire cell sits in.

        The archive counts longitude up from Greenwich, 0 to 358.5, not from
        the date line the way every other grid in this project does. Reading
        it as though it started at -180 put Fergana in Arizona, and Arizona
        in July is hot and dry enough that the numbers looked entirely
        reasonable — which is how a bug like this survives a smoke test.
        """
        iy = np.clip(((lat + 90) / self.degrees).astype(np.int32), 0, self.n_lat - 1)
        ix = np.clip(((lon % 360) / self.degrees).astype(np.int32), 0, self.n_lon - 1)
        return ix, iy

    def window(self, ix: np.ndarray, iy: np.ndarray, day0: np.ndarray) -> np.ndarray:
        """
        The six columns, for a set of (cell, day) pairs.

        The window runs from the day after the forecast is made to the last
        day of the horizon, which is exactly the span the target counts
        fires over. Reading it as one slice per distinct cell rather than
        one per row is what keeps this affordable: a tile has tens of
        thousands of rows and tens of cells.
        """
        n = day0.size
        out = np.zeros((n, len(COLUMNS)), dtype=np.float32)
        if n == 0:
            return out

        flat = ix.astype(np.int64) * self.n_lat + iy.astype(np.int64)
        for cell in np.unique(flat):
            here = np.where(flat == cell)[0]
            cx, cy = int(cell // self.n_lat), int(cell % self.n_lat)

            # One column of the record, cast up from half precision once.
            t = np.asarray(self.tmax[:, cx, cy], dtype=np.float32)
            w = np.asarray(self.wind[:, cx, cy], dtype=np.float32)
            r = np.asarray(self.rain[:, cx, cy], dtype=np.float32)

            # The last day of the mirror never arrived; carrying the day
            # before it forward is truer than a zero and cheaper than
            # dropping every row that touches it.
            for series in (t, w, r):
                holes = np.isnan(series)
                if holes.any():
                    series[holes] = np.interp(
                        np.flatnonzero(holes), np.flatnonzero(~holes), series[~holes]
                    )

            days = day0[here]
            lo = np.clip(days + 1, 0, self.days - 1)
            hi = np.clip(days + self.horizon, 0, self.days - 1)

            # Cumulative sums make the window totals two lookups instead of
            # a loop over its days; the maxima need the loop, but it runs
            # over the horizon, not over the rows.
            rain_cum = np.concatenate(([0.0], np.cumsum(r, dtype=np.float64)))
            dry_cum = np.concatenate(([0.0], np.cumsum(r < DRY_MM, dtype=np.float64)))

            out[here, 1] = rain_cum[hi + 1] - rain_cum[lo]
            out[here, 3] = dry_cum[hi + 1] - dry_cum[lo]

            hot = np.full(here.size, -99.0, dtype=np.float32)
            gust = np.zeros(here.size, dtype=np.float32)
            for k in range(self.horizon):
                d = np.clip(days + 1 + k, 0, self.days - 1)
                np.maximum(hot, t[d], out=hot)
                np.maximum(gust, w[d], out=gust)
            out[here, 0] = hot
            out[here, 2] = gust

            out[here, 4] = self.veg_low[cx, cy]
            out[here, 5] = self.veg_high[cx, cy]

        return out
