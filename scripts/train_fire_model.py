"""
A seven-day fire probability, trained on the archive itself.

The question: given what the record knows about a quarter-degree cell up to
today, how likely is a fire to be detected there in the next seven days? Not
"will this cell burn" — a probability, and one that has to earn its place
against two baselines that need no model at all.

── Only MODIS, and why ────────────────────────────────────────────────────

The target counts MODIS detections alone, never the combined figure. The
combined series steps upward in 2012, 2018 and 2024 as satellites join, so a
model trained before a step and scored after it would be judged on a target
whose base rate moved for reasons unrelated to fire. MODIS Terra and Aqua have
both flown since 2002 and nothing has been added since.

It also sharpens the meaning. A 1 km sensor misses the smallest fires, so this
is the probability of a fire big enough for MODIS to see — nearer to "a fire
that matters" than a VIIRS-inclusive target would be.

── The two baselines it must beat ─────────────────────────────────────────

Climatology — how often this cell burns around this time of year.
Persistence — whether it burned in the last seven days.

Both are free. A model that does not clearly beat both is worse than nothing:
it adds the appearance of sophistication to the same information. The report
prints all three side by side, on the same rows.

── Honest splits ──────────────────────────────────────────────────────────

By time, never at random. Consecutive days of one cell are nearly the same
example, so a random split lets the model meet a fire it has already seen and
produces beautiful numbers with no skill behind them.

    train 2003-2018    validate 2019-2021    test 2022-2026

Sampling differs by purpose. Training takes every positive and a few negatives
each, because under a one-per-cent base rate a model fed raw data learns to
say "no" and stop. The test set is drawn at the natural rate, untouched, so
precision and recall mean what they normally mean.

── Memory ─────────────────────────────────────────────────────────────────

One tile at a time, and within a tile the sample is chosen *before* any
feature is computed: every window then comes from a single cumulative sum by
subtraction, rather than from nine full-size rolling arrays. That is the
difference between two gigabytes and two hundred megabytes.

    python scripts/train_fire_model.py
"""

from __future__ import annotations

import gc
import gzip
import json
import os
import struct
import sys
from datetime import date, timedelta

import numpy as np

# The horizon is a command-line argument so the same feature code serves the
# week, the month and the season without a copy of itself per horizon.
HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7

# Weather is optional so the two models can be compared on identical rows.
# `python scripts/train_fire_model.py 7 dry` builds the same samples, the
# same splits and the same seed without the weather columns, which is the
# only way to say what the weather is actually worth.
WITH_WEATHER = "dry" not in sys.argv[2:]

DAYS_DIR = "public/data/world/days"
INDEX = "public/data/world/days-index.json"
OUT = f"models/features-{HORIZON}d{'' if WITH_WEATHER else '-dry'}.npz"

# The splits end in 2021 because that is where the weather record ends.
#
# The public ERA5 mirror that can be read in bulk carries 1959 to 2021; the
# fire archive runs to 2026. Training on years the weather does not cover
# would mean two models scored on two different questions, so the fire-only
# model is re-run on exactly these years too. Four years of test is fewer
# than before and still four fire seasons the model has never seen.
ERAS = {0: (2003, 2013), 1: (2014, 2017), 2: (2018, 2021)}
ONI_FILE = "models/oni.json"
EPOCH = date(2003, 1, 1)
LAST = date(2026, 9, 19)

NEG_PER_POS = 3
CAP = {0: 7000, 1: 2200, 2: 5000}
DAY_STRIDE = 4
RNG = np.random.default_rng(20260920)

FEATURES = [
    "own_1d", "own_3d", "own_7d", "own_14d", "own_30d", "own_90d",
    "ring_1d", "ring_3d", "ring_7d", "ring_30d",
    "doy_sin", "doy_cos",
    "clim", "clim_ring", "cell_rate", "since_last", "lat",
    # How many of the last thirty days had any fire at all. One violent day
    # and a month of smouldering give the same total; they are not the same
    # situation, and the count alone cannot tell them apart.
    "active_30d",
    # The same fortnight a year ago. Climatology is smoothed over sixteen
    # years and loses a place that burns hard in one particular week.
    "lastyear_14d",
    # ── The closest thing to weather that this archive contains ──────────
    #
    # There is no rainfall here and no wind. But a cell burning three times
    # its own normal for this date is telling you the ground is dry, and a
    # whole region doing so is telling you there is a drought. That is an
    # observation of the effect rather than a forecast of the cause, and it
    # is available at every scale for nothing.
    "anom_30d",
    "ring_anom_30d",
    "tile_anom_30d",
    # How the year is running so far, for the longer horizons.
    "ytd_anom",
    # El Nino. A genuine seasonal driver: the Indonesian and Amazonian fire
    # years that stand out in the record are the El Nino ones.
    "oni",
]

if WITH_WEATHER:
    from weather_features import COLUMNS as WEATHER_COLUMNS

    FEATURES = FEATURES + list(WEATHER_COLUMNS)


def day_index(y: int, doy1: int) -> int:
    return (date(y, 1, 1) + timedelta(days=doy1 - 1) - EPOCH).days


def load_tile(tx: int, ty: int, groups: list[int], n_days: int, side: int) -> np.ndarray | None:
    """One tile's MODIS counts, dense [cells, days]."""
    grid = None
    for g in groups:
        path = f"{DAYS_DIR}/{tx}-{ty}-{g}.bin.gz"
        if not os.path.exists(path):
            continue
        with gzip.open(path, "rb") as fh:
            raw = fh.read()
        n_years = struct.unpack_from("<H", raw, 0)[0]
        p = 2
        for _ in range(n_years):
            year, count = struct.unpack_from("<HI", raw, p)
            p += 6
            body = p
            p += count * 8
            if count == 0 or not (EPOCH.year <= year <= LAST.year):
                continue
            block = np.frombuffer(raw, dtype=np.uint16, count=count * 4, offset=body).reshape(count, 4)
            modis = block[:, 2]
            keep = modis > 0
            if not keep.any():
                continue
            base = (date(year, 1, 1) - EPOCH).days
            di = base + block[:, 1][keep].astype(np.int64)
            ok = (di >= 0) & (di < n_days)
            if not ok.any():
                continue
            if grid is None:
                grid = np.zeros((side * side, n_days), dtype=np.uint16)
            np.add.at(grid, (block[:, 0][keep][ok].astype(np.int32), di[ok]), modis[keep][ok])
    return grid


def ring_of(grid: np.ndarray, side: int) -> np.ndarray:
    """The eight surrounding cells, summed. Edge cells are never sampled, so
    their incomplete ring never becomes a training example."""
    g = grid.reshape(side, side, -1).astype(np.int32)
    out = np.zeros_like(g)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            out[max(0, dy) : side + min(0, dy), max(0, dx) : side + min(0, dx)] += g[
                max(0, -dy) : side + min(0, -dy), max(0, -dx) : side + min(0, -dx)
            ]
    return out.reshape(side * side, -1)


def window(cum: np.ndarray, cells: np.ndarray, days: np.ndarray, w: int) -> np.ndarray:
    """Sum over the `w` days ending at `days`, from one cumulative array."""
    hi = cum[cells, days]
    prev = days - w
    lo = np.where(prev >= 0, cum[cells, np.maximum(prev, 0)], 0)
    return hi - lo


def climatology(grid: np.ndarray, doy_of: np.ndarray, year_of: np.ndarray) -> np.ndarray:
    """How often each cell burns around each day of the year.

    From the training era only, so a test-year row cannot consult a statistic
    its own outcome helped to build. Smoothed over a fortnight: a season does
    not begin on a fixed date, and sixteen samples of one calendar day is far
    too sharp a question.
    """
    lo, hi = ERAS[0]
    train = np.where((year_of >= lo) & (year_of <= hi))[0]
    hits = np.zeros((grid.shape[0], 366), dtype=np.float32)
    seen = np.zeros(366, dtype=np.float32)
    for d in train:
        k = doy_of[d] - 1
        hits[:, k] += grid[:, d] > 0
        seen[k] += 1
    seen[seen == 0] = 1
    rate = hits / seen
    pad = np.concatenate([rate[:, -7:], rate, rate[:, :7]], axis=1)
    k = np.ones(15, dtype=np.float32) / 15
    sm = np.empty_like(pad)
    for i in range(pad.shape[0]):
        sm[i] = np.convolve(pad[i], k, mode="same")
    return np.ascontiguousarray(sm[:, 7:-7])


def count_climatology(grid, cum, doy_of, year_of, n_days, window_days):
    """The usual size of a `window_days` total, per cell and day of year.

    The burn-probability climatology answers "does it burn here now"; this
    answers "how much", which is what an anomaly needs as its denominator.
    Training years only, same as the other one.
    """
    lo, hi = ERAS[0]
    train = np.where((year_of >= lo) & (year_of <= hi))[0]
    acc = np.zeros((grid.shape[0], 366), dtype=np.float32)
    seen = np.zeros(366, dtype=np.float32)
    for d in train:
        prev = max(0, d - window_days)
        acc[:, doy_of[d] - 1] += cum[:, d] - cum[:, prev]
        seen[doy_of[d] - 1] += 1
    seen[seen == 0] = 1
    rate = acc / seen
    pad = np.concatenate([rate[:, -10:], rate, rate[:, :10]], axis=1)
    k = np.ones(21, dtype=np.float32) / 21
    sm = np.empty_like(pad)
    for i in range(pad.shape[0]):
        sm[i] = np.convolve(pad[i], k, mode="same")
    return np.ascontiguousarray(sm[:, 10:-10])


def load_oni():
    """Monthly El Nino index, (year, month) -> value."""
    try:
        return {tuple(int(x) for x in k.split("-")): v for k, v in json.load(open(ONI_FILE)).items()}
    except Exception:
        return {}


def tile_rows(grid, tx, ty, idx, n_days, doy_of, year_of, oni_by_day, weather=None):
    side, deg, step = idx["tileCells"], idx["degrees"], idx["tileDegrees"]

    ever = grid.max(axis=1) > 0
    rows_ix = np.arange(side * side) // side
    cols_ix = np.arange(side * side) % side
    inner = (rows_ix > 0) & (rows_ix < side - 1) & (cols_ix > 0) & (cols_ix < side - 1)
    usable = np.where(ever & inner)[0]
    if usable.size == 0:
        return None

    clim = climatology(grid, doy_of, year_of)
    # The neighbourhood's climatology: whether the region is in season, which
    # is a different question from whether this one cell usually burns.
    clim_ring = ring_of(clim.astype(np.float32), side) / 8.0
    cum = np.cumsum(grid, axis=1, dtype=np.int32)
    ring = ring_of(grid, side)
    cum_ring = np.cumsum(ring, axis=1, dtype=np.int32)
    del ring
    # Days with any fire, as its own cumulative sum.
    cum_active = np.cumsum(grid > 0, axis=1, dtype=np.int32)

    # Denominators for the anomalies: what a normal thirty days looks like
    # here, for the cell, for its neighbours and for the whole tile.
    clim30 = count_climatology(grid, cum, doy_of, year_of, n_days, 30)
    ring_clim30 = ring_of(clim30, side) / 8.0
    tile_cum = cum.sum(axis=0)
    tile_clim30 = np.zeros(366, dtype=np.float64)
    seen30 = np.zeros(366, dtype=np.float64)
    lo0, hi0 = ERAS[0]
    for d in np.where((year_of >= lo0) & (year_of <= hi0))[0]:
        tile_clim30[doy_of[d] - 1] += tile_cum[d] - tile_cum[max(0, d - 30)]
        seen30[doy_of[d] - 1] += 1
    seen30[seen30 == 0] = 1
    tile_clim30 /= seen30

    # Year to date, and its usual size, for the longer horizons.
    jan1 = np.array([d - (doy_of[d] - 1) for d in range(n_days)])
    ytd = cum[:, np.arange(n_days)] - cum[:, np.maximum(jan1, 0)]
    ytd_clim = np.zeros((grid.shape[0], 366), dtype=np.float32)
    seen_y = np.zeros(366, dtype=np.float32)
    for d in np.where((year_of >= lo0) & (year_of <= hi0))[0]:
        ytd_clim[:, doy_of[d] - 1] += ytd[:, d]
        seen_y[doy_of[d] - 1] += 1
    seen_y[seen_y == 0] = 1
    ytd_clim /= seen_y

    # Days since the cell last burned, capped at a year.
    since = np.empty(grid.shape, dtype=np.int16)
    last = np.full(grid.shape[0], -400, dtype=np.int32)
    for d in range(n_days):
        np.minimum(d - last, 365, out=since[:, d], casting="unsafe")
        last = np.where(grid[:, d] > 0, d, last)

    train_years = ERAS[0][1] - ERAS[0][0] + 1
    cell_rate = np.log1p(grid.sum(axis=1, dtype=np.int64) / train_years).astype(np.float32)

    chunks = []
    for split, (lo, hi) in ERAS.items():
        days = np.where((year_of >= lo) & (year_of <= hi) & (np.arange(n_days) < n_days - HORIZON))[0]
        days = days[::DAY_STRIDE]
        if days.size == 0:
            continue

        cells = np.repeat(usable, days.size)
        dd = np.tile(days, usable.size)

        # Target first: the next seven days, straight out of the cumulative sum.
        fut = cum[cells, np.minimum(dd + HORIZON, n_days - 1)] - cum[cells, dd]
        y = (fut > 0).astype(np.int8)

        if split == 2:
            take = RNG.random(y.size) < min(1.0, CAP[2] / max(y.size, 1))
        else:
            pos = y == 1
            rate = min(1.0, NEG_PER_POS * max(pos.mean(), 1e-6))
            take = pos | ((~pos) & (RNG.random(y.size) < rate))
            if take.sum() > CAP[split]:
                keep = np.where(take)[0]
                take = np.zeros_like(take)
                take[RNG.choice(keep, CAP[split], replace=False)] = True
        if take.sum() == 0:
            continue

        cells, dd, y = cells[take], dd[take], y[take]
        lat0 = ty * step - 90
        feats = np.empty((cells.size, len(FEATURES)), dtype=np.float32)
        for i, w in enumerate((1, 3, 7, 14, 30, 90)):
            feats[:, i] = np.log1p(window(cum, cells, dd, w))
        for i, w in enumerate((1, 3, 7, 30), start=6):
            feats[:, i] = np.log1p(window(cum_ring, cells, dd, w))
        feats[:, 10] = np.sin(2 * np.pi * doy_of[dd] / 365.25)
        feats[:, 11] = np.cos(2 * np.pi * doy_of[dd] / 365.25)
        feats[:, 12] = clim[cells, doy_of[dd] - 1]
        feats[:, 13] = clim_ring[cells, doy_of[dd] - 1]
        feats[:, 14] = cell_rate[cells]
        feats[:, 15] = since[cells, dd] / 365.0
        feats[:, 16] = (lat0 + (cells // side + 0.5) * deg) / 90.0
        feats[:, 17] = window(cum_active, cells, dd, 30) / 30.0
        ago = np.maximum(dd - 365, 0)
        feats[:, 18] = np.where(dd >= 372, np.log1p(window(cum, cells, ago, 14)), 0.0)

        own30 = window(cum, cells, dd, 30).astype(np.float32)
        ring30 = window(cum_ring, cells, dd, 30).astype(np.float32)
        doy0 = doy_of[dd] - 1
        feats[:, 19] = np.log1p(own30) - np.log1p(clim30[cells, doy0])
        feats[:, 20] = np.log1p(ring30) - np.log1p(ring_clim30[cells, doy0])
        tile30 = (tile_cum[dd] - tile_cum[np.maximum(dd - 30, 0)]).astype(np.float64)
        feats[:, 21] = np.log1p(tile30) - np.log1p(tile_clim30[doy0])
        feats[:, 22] = np.log1p(ytd[cells, dd]) - np.log1p(ytd_clim[cells, doy0])
        feats[:, 23] = oni_by_day[dd]

        if weather is not None:
            #
            # The weather of the week each row is asked about.
            #
            # `dd` is the day the forecast is made; the window the target
            # counts over is the `HORIZON` days after it, and that is the
            # window read here. Anything else would be telling the model
            # about a different week than the one it is being graded on.
            #
            lat = lat0 + (cells // side + 0.5) * deg
            lon = (tx * step - 180) + (cells % side + 0.5) * deg
            wx, wy = weather.index_of(lat, lon)
            feats[:, 24:] = weather.window(wx, wy, dd)

        chunks.append((feats, y, np.full(y.size, split, dtype=np.int8)))

    del cum, cum_ring, cum_active, since, clim, clim_ring, clim30, ring_clim30, ytd, ytd_clim
    if not chunks:
        return None
    return (
        np.concatenate([c[0] for c in chunks]),
        np.concatenate([c[1] for c in chunks]),
        np.concatenate([c[2] for c in chunks]),
    )


def main() -> None:
    idx = json.load(open(INDEX, encoding="utf-8"))
    side = idx["tileCells"]
    n_days = (LAST - EPOCH).days + 1
    doy_of = np.array([(EPOCH + timedelta(days=int(d))).timetuple().tm_yday for d in range(n_days)])
    year_of = np.array([(EPOCH + timedelta(days=int(d))).year for d in range(n_days)])

    oni = load_oni()
    oni_by_day = np.zeros(n_days, dtype=np.float32)
    for d in range(n_days):
        day = EPOCH + timedelta(days=d)
        oni_by_day[d] = oni.get((day.year, day.month), 0.0)

    weather = None
    if WITH_WEATHER:
        from weather_features import Weather

        weather = Weather(HORIZON)
        print(f"weather: {weather.days:,} days from {weather.first} at {weather.degrees} deg")

    tiles = sorted(idx["tiles"].items())
    print(f"{len(tiles)} tiles, {n_days} days, horizon {HORIZON}d, MODIS only")
    print(f"features: {len(FEATURES)}{' with weather' if WITH_WEATHER else ' , fire only'}")
    print(f"El Nino index: {'loaded' if oni else 'MISSING - run fetch_oni.py'}")

    X, Y, S = [], [], []
    for n, (key, groups) in enumerate(tiles, 1):
        tx, ty = (int(v) for v in key.split("-"))
        grid = load_tile(tx, ty, groups, n_days, side)
        if grid is None:
            continue
        got = tile_rows(grid, tx, ty, idx, n_days, doy_of, year_of, oni_by_day, weather)
        del grid
        gc.collect()
        if got is None:
            continue
        X.append(got[0])
        Y.append(got[1])
        S.append(got[2])
        if n % 50 == 0:
            print(f"  {n}/{len(tiles)}  {sum(x.shape[0] for x in X):,} rows")

    X = np.concatenate(X)
    Y = np.concatenate(Y)
    S = np.concatenate(S)
    print(f"\n{X.shape[0]:,} rows x {X.shape[1]} features")
    for name, s in (("train", 0), ("valid", 1), ("test", 2)):
        m = S == s
        print(f"  {name:6s} {int(m.sum()):>10,}   positives {Y[m].mean():.3%}")

    np.savez_compressed(OUT, X=X, Y=Y, S=S, features=np.array(FEATURES))
    print(f"\n{OUT}  ({os.path.getsize(OUT) / 1048576:.0f} MB)")


if __name__ == "__main__":
    os.makedirs("models", exist_ok=True)
    main()
