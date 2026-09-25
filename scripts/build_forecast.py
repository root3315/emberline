"""
Apply the model to the end of the record and ship the result as a map.

The site is static, so the forecast is built here rather than in the browser:
one file of probabilities, as of the last day the archive holds, exactly like
the weekly snapshot beside it. It is honest about being a build-time artefact
and the caption says which week it covers.

── The one thing that has to be exact ─────────────────────────────────────

The neighbourhood features. Training could afford to skip the cells on a
tile's border, because a missing ten per cent of samples costs nothing. A map
cannot: an under-read border every ten degrees would draw a grid of faint
seams across the planet and look like a bug, which it would be.

So the recent activity is assembled globally first — the last thirty-one days
of the whole Earth, sixty-four megabytes — and the ring is summed across tile
boundaries, wrapping at the date line. Everything that depends only on the
cell's own history still comes from the per-tile pass, where the full
twenty-four years are at hand.

    python scripts/build_forecast.py [horizon]
"""

from __future__ import annotations

import gzip
import json
import os
import pickle
import struct
import sys
from datetime import timedelta

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7

# A shorter horizon writes its grid and keeps quiet about the metadata.
# `forecast.json` describes the week the page opens on, and a run for
# "by Tuesday" must not overwrite it; `build_horizons.py` collects the
# shorter ones into an index afterwards.
SECONDARY = "secondary" in sys.argv[2:]
DAYS_DIR = "public/data/world/days"
INDEX = "public/data/world/days-index.json"
MODEL = f"models/fire-{HORIZON}d.pkl"
META = f"models/fire-{HORIZON}d.json"
ONI_FILE = "models/oni.json"
OUT_BIN = f"public/data/world/forecast-{HORIZON}d.bin"
OUT_JSON = "public/data/forecast.json"
OUT_ROWS = f"models/forecast-rows-{HORIZON}d.npz"

WEATHER = f"models/weather-forecast-{HORIZON}d.npz"
WEATHER_STATIC = "models/weather-static.npz"
WEATHER_DEG = 1.5
DRY_MM = 1.0

# Imported rather than repeated. The archive's last day was written out
# by hand in three files, and the forecast is wrong in a quiet way if they
# ever disagree: the window, the weather and the feature windows would each
# be counting from a different day.
from train_fire_model import EPOCH, LAST, ERAS  # noqa: E402
# The training years, taken from the training script. This was typed here
# as 2003-2018 while the features were built on 2003-2013, so three of the
# columns — the tile's usual month, the year-to-date norm and the cell's
# yearly rate — meant one thing when the model learned them and another
# when it was asked.
TRAIN_ERA = ERAS[0]
RECENT = 31

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_fire_model import (  # noqa: E402
    climatology,
    count_climatology,
    load_tile,
    ring_of,
    window,
)


def weather_table() -> dict | None:
    """
    The forecast weather, reduced to the six columns the model was trained
    on, laid out so a cell index reads straight off it.

    The training half of this came from a reanalysis of weeks that had
    already happened; this is a real forecast of a week that has not. They
    are the same quantities on the same grid, which is the most that can be
    arranged, and the difference between them is why the page calls the
    skill figure an upper bound.
    """
    try:
        got = np.load(WEATHER)
        fixed = np.load(WEATHER_STATIC)
    except FileNotFoundError:
        print("  no weather forecast; the model will be asked without it")
        return None

    #
    # Say so when the weather is for a different week.
    #
    # This went wrong silently for every build until it was noticed by
    # reading the two files side by side. A forecast quietly fed the wrong
    # week is worse than one that refuses to build, because it looks
    # exactly like a forecast.
    #
    want = [str(LAST + timedelta(days=d + 1)) for d in range(HORIZON)]
    have = [str(d) for d in got["days"]] if "days" in got else []
    if have and have != want:
        print(f"  WEATHER WINDOW MISMATCH: file has {have[0]}..{have[-1]}, "
              f"the forecast needs {want[0]}..{want[-1]}")
        print("  re-run scripts/fetch_gfs.py; refusing to build on the wrong week")
        raise SystemExit(1)

    wide = int(360 / WEATHER_DEG)
    tall = int(180 / WEATHER_DEG)
    rain = np.asarray(got["precipitation_sum"], dtype=np.float32)

    table = np.full((tall * wide, 6), np.nan, dtype=np.float32)
    key = np.asarray(got["key"], dtype=np.int64)
    table[key, 0] = np.nanmax(np.asarray(got["temperature_2m_max"], dtype=np.float32), axis=1)
    table[key, 1] = np.nansum(rain, axis=1)
    table[key, 2] = np.nanmax(np.asarray(got["wind_speed_10m_max"], dtype=np.float32), axis=1)
    table[key, 3] = (rain < DRY_MM).sum(axis=1)

    # The static fields are (longitude, latitude) counting longitude up from
    # Greenwich; the table is keyed from the date line, so the columns are
    # rolled rather than the lookups being special-cased.
    veg_low = np.asarray(fixed["low_vegetation_cover"], dtype=np.float32)
    veg_high = np.asarray(fixed["high_vegetation_cover"], dtype=np.float32)
    for n, field in enumerate((veg_low, veg_high), start=4):
        rolled = np.roll(field, wide // 2, axis=0)  # Greenwich-first -> date-line-first
        table[:, n] = rolled.T.reshape(-1)[: tall * wide]

    print(f"  weather: {key.size:,} squares, {got['days'][0]} to {got['days'][-1]}")
    return {"table": table, "wide": wide, "tall": tall}


def main() -> None:
    idx = json.load(open(INDEX, encoding="utf-8"))
    side, deg, step = idx["tileCells"], idx["degrees"], idx["tileDegrees"]
    cols, rows = idx["cols"], idx["rows"]
    n_days = (LAST - EPOCH).days + 1
    today = n_days - 1

    doy_of = np.array([(EPOCH + timedelta(days=int(d))).timetuple().tm_yday for d in range(n_days)])
    year_of = np.array([(EPOCH + timedelta(days=int(d))).year for d in range(n_days)])

    bundle = pickle.load(open(MODEL, "rb"))
    model, names = bundle["model"], bundle["features"]
    trained_rate, true_rate = bundle["trained_rate"], bundle["true_rate"]

    #
    # The columns below are filled by position, and a model may want fewer
    # of them than there are.
    #
    # Every `f[:, n] = ...` in this function writes a named feature to a
    # number it agreed on with the training script, which was fine while
    # every model used all thirty. A model fitted without some of them
    # would have had its columns silently shifted — the weather block
    # landing on El Nino, and a forecast that is wrong everywhere without
    # being wrong anywhere in particular. So the full set is always built
    # and the model's own list picks from it by name.
    #
    from train_fire_model import FEATURES as ALL_FEATURES
    from train_fire_model import load_people, people_at

    # The same two columns the training side adds, read from the same
    # file. Absent, the model simply was not fitted with them.
    people = load_people() if "pop" in names else None

    missing = [n for n in names if n not in ALL_FEATURES]
    if missing:
        raise SystemExit(f"model wants features this script cannot build: {missing}")
    pick = [ALL_FEATURES.index(n) for n in names]

    oni = {tuple(int(x) for x in k.split("-")): v for k, v in json.load(open(ONI_FILE)).items()}
    oni_now = oni.get(((EPOCH + timedelta(days=today)).year, (EPOCH + timedelta(days=today)).month), 0.0)

    # Asked for by name rather than by counting columns, for the same reason.
    weather = weather_table() if any(n.startswith("w_") for n in names) else None

    tiles = sorted(idx["tiles"].items())
    print(f"{len(tiles)} tiles, forecast from day {LAST} over {HORIZON}d, {len(names)} features")

    # Pass one: the planet's last month, so the ring is exact across seams.
    recent = np.zeros((rows * cols, RECENT), dtype=np.uint16)
    for key, groups in tiles:
        tx, ty = (int(v) for v in key.split("-"))
        grid = load_tile(tx, ty, groups, n_days, side)
        if grid is None:
            continue
        local = grid[:, today - RECENT + 1 : today + 1]
        r = (np.arange(side * side) // side) + ty * side
        c = (np.arange(side * side) % side) + tx * side
        recent[r * cols + c] = local
        del grid

    print("  global ring...")
    g = recent.reshape(rows, cols, RECENT).astype(np.int32)
    ring_recent = np.zeros_like(g)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            src = np.roll(g, shift=dx, axis=1)  # longitude wraps at the date line
            if dy < 0:
                ring_recent[:dy] += src[-dy:]
            elif dy > 0:
                ring_recent[dy:] += src[:-dy]
            else:
                ring_recent += src
    ring_recent = ring_recent.reshape(rows * cols, RECENT)
    del g, recent

    cum_ring_g = np.cumsum(ring_recent, axis=1, dtype=np.int32)
    del ring_recent

    # Pass two: everything that needs a cell's own long history.
    out_cells: list[np.ndarray] = []
    out_prob: list[np.ndarray] = []
    out_rows: list[np.ndarray] = []
    for n, (key, groups) in enumerate(tiles, 1):
        tx, ty = (int(v) for v in key.split("-"))
        grid = load_tile(tx, ty, groups, n_days, side)
        if grid is None:
            continue
        ever = np.where(grid.max(axis=1) > 0)[0]
        if ever.size == 0:
            del grid
            continue

        cum = np.cumsum(grid, axis=1, dtype=np.int32)
        cum_active = np.cumsum(grid > 0, axis=1, dtype=np.int32)
        clim = climatology(grid, doy_of, year_of)
        clim_ring = ring_of(clim, side) / 8.0
        clim30 = count_climatology(grid, cum, doy_of, year_of, n_days, 30)
        ring_clim30 = ring_of(clim30, side) / 8.0

        tile_cum = cum.sum(axis=0)
        tile_clim30 = np.zeros(366, dtype=np.float64)
        seen30 = np.zeros(366, dtype=np.float64)
        lo0, hi0 = TRAIN_ERA
        for d in np.where((year_of >= lo0) & (year_of <= hi0))[0]:
            tile_clim30[doy_of[d] - 1] += tile_cum[d] - tile_cum[max(0, d - 30)]
            seen30[doy_of[d] - 1] += 1
        seen30[seen30 == 0] = 1
        tile_clim30 /= seen30

        jan1 = today - (doy_of[today] - 1)
        ytd_now = cum[:, today] - cum[:, max(jan1, 0)]
        ytd_clim = np.zeros(grid.shape[0], dtype=np.float32)
        seen_y = 0
        for d in np.where((year_of >= lo0) & (year_of <= hi0) & (doy_of == doy_of[today]))[0]:
            j = d - (doy_of[d] - 1)
            ytd_clim += cum[:, d] - cum[:, max(j, 0)]
            seen_y += 1
        ytd_clim /= max(seen_y, 1)

        since = np.full(grid.shape[0], 365, dtype=np.int32)
        for back in range(0, 366):
            d = today - back
            if d < 0:
                break
            hit = (grid[:, d] > 0) & (since == 365)
            since[hit] = back

        cells = ever
        dd = np.full(cells.size, today)
        doy0 = doy_of[today] - 1
        gr = (cells // side) + ty * side
        gc = (cells % side) + tx * side
        gix = gr * cols + gc
        last_ix = RECENT - 1

        def ring_win(w: int) -> np.ndarray:
            return cum_ring_g[gix, last_ix] - cum_ring_g[gix, max(last_ix - w, 0)]

        f = np.empty((cells.size, len(ALL_FEATURES)), dtype=np.float32)
        for i, w in enumerate((1, 3, 7, 14, 30, 90)):
            f[:, i] = np.log1p(window(cum, cells, dd, w))
        for i, w in enumerate((1, 3, 7, 30), start=6):
            f[:, i] = np.log1p(ring_win(w))
        f[:, 10] = np.sin(2 * np.pi * doy_of[today] / 365.25)
        f[:, 11] = np.cos(2 * np.pi * doy_of[today] / 365.25)
        f[:, 12] = clim[cells, doy0]
        f[:, 13] = clim_ring[cells, doy0]
        t_lo = int(np.where(year_of >= TRAIN_ERA[0])[0][0])
        t_hi = int(np.where(year_of <= TRAIN_ERA[1])[0][-1])
        f[:, 14] = np.log1p(
            grid[cells, t_lo : t_hi + 1].sum(axis=1, dtype=np.int64) / (TRAIN_ERA[1] - TRAIN_ERA[0] + 1)
        )
        f[:, 15] = since[cells] / 365.0
        f[:, 16] = ((ty * step - 90) + (cells // side + 0.5) * deg) / 90.0
        f[:, 17] = (cum_active[cells, today] - cum_active[cells, max(today - 30, 0)]) / 30.0
        ago = max(today - 365, 0)
        f[:, 18] = np.log1p(window(cum, cells, np.full(cells.size, ago), 14)) if today >= 372 else 0.0
        own30 = window(cum, cells, dd, 30).astype(np.float32)
        f[:, 19] = np.log1p(own30) - np.log1p(clim30[cells, doy0])
        f[:, 20] = np.log1p(ring_win(30).astype(np.float32)) - np.log1p(ring_clim30[cells, doy0])
        t30 = float(tile_cum[today] - tile_cum[max(today - 30, 0)])
        f[:, 21] = np.log1p(t30) - np.log1p(tile_clim30[doy0])
        f[:, 22] = np.log1p(ytd_now[cells]) - np.log1p(ytd_clim[cells])
        f[:, 23] = oni_now

        if weather is not None:
            #
            # The same six columns, in the same order, from a forecast
            # rather than from the record. A cell with no weather square —
            # which should not happen, since the squares were chosen to
            # cover every cell that has ever burned — is left at zero
            # rather than dropped, so the map keeps its coverage.
            #
            lat = (ty * step - 90) + (cells // side + 0.5) * deg
            lon = (tx * step - 180) + (cells % side + 0.5) * deg
            wr = np.clip(((lat + 90) / WEATHER_DEG).astype(np.int32), 0, weather["tall"] - 1)
            wc = np.clip(((lon + 180) / WEATHER_DEG).astype(np.int32), 0, weather["wide"] - 1)
            block = weather["table"][wr * weather["wide"] + wc]
            f[:, 24:24 + block.shape[1]] = np.nan_to_num(block, nan=0.0)

        if people is not None:
            at = ALL_FEATURES.index("pop")
            plat = (ty * step - 90) + (cells // side + 0.5) * deg
            plon = (tx * step - 180) + (cells % side + 0.5) * deg
            f[:, at], f[:, at + 1] = people_at(people, plat, plon)

        raw = model.predict_proba(f[:, pick])[:, 1]
        eps = 1e-9
        pc = np.clip(raw, eps, 1 - eps)
        shift = np.log((trained_rate / (1 - trained_rate)) / (true_rate / (1 - true_rate)))
        p = 1 / (1 + np.exp(-(np.log(pc / (1 - pc)) - shift)))

        keep = p >= 0.01
        if keep.any():
            out_cells.append(gix[keep].astype(np.uint32))
            out_prob.append(np.round(p[keep] * 255).astype(np.uint8))
            #
            # The rows themselves, for the cells that made the cut.
            #
            # `build_reasons.py` asks the model what each cell's number
            # would have been if one thing about it were ordinary, which
            # needs the row the number came from. Recomputing them later
            # would mean rebuilding every tile a second time; carrying
            # them out costs thirteen megabytes and a `.npz`.
            #
            out_rows.append(f[keep].astype(np.float32))

        del grid, cum, cum_active, clim, clim_ring, clim30, ring_clim30
        if n % 80 == 0:
            print(f"  {n}/{len(tiles)}  {sum(a.size for a in out_cells):,} cells")

    cells = np.concatenate(out_cells)
    probs = np.concatenate(out_prob)
    # Named for what it is, and not `rows`: that name is already the
    # grid's row count, twenty lines up, and shadowing it put a numpy
    # array into forecast.json and truncated the file mid-write.
    feat_rows = np.concatenate(out_rows)
    order = np.argsort(cells)
    cells, probs, feat_rows = cells[order], probs[order], feat_rows[order]

    # Saved in the grid's own order, so a reason file can be read straight
    # down beside it without carrying cell indices of its own.
    np.savez_compressed(
        OUT_ROWS,
        cells=cells,
        rows=feat_rows,
        features=np.array(ALL_FEATURES),
        used=np.array(names),
    )
    print(f"{OUT_ROWS}  ({feat_rows.nbytes / 1e6:.0f} MB of rows for the reasons)")

    buf = bytearray(struct.pack("<I", cells.size))
    buf += cells.astype("<u4").tobytes()
    buf += probs.tobytes()
    blob = gzip.compress(bytes(buf), 9)
    os.makedirs(os.path.dirname(OUT_BIN), exist_ok=True)
    with open(OUT_BIN + ".gz", "wb") as fh:
        fh.write(blob)

    if SECONDARY:
        print(f"{cells.size:,} cells above 1%   (secondary: the index is untouched)")
        print(f"{OUT_BIN}.gz")
        return

    meta = json.load(open(META, encoding="utf-8"))
    from_day = LAST + timedelta(days=1)
    json.dump(
        {
            "horizonDays": HORIZON,
            "degrees": 0.25,
            "cols": cols,
            "rows": rows,
            "cells": int(cells.size),
            "from": from_day.isoformat(),
            "to": (LAST + timedelta(days=HORIZON)).isoformat(),
            "asOf": LAST.isoformat(),
            "file": f"world/forecast-{HORIZON}d.bin.gz",
            "threshold": 0.01,
            "skill": {
                "model": meta["scores"]["model"]["average_precision"],
                "climatology": meta["scores"]["climatology"]["average_precision"],
                "persistence": meta["scores"]["persistence"]["average_precision"],
                "baseRate": meta["test_base_rate"],
                "rocAuc": meta["scores"]["model"]["roc_auc"],
            },
            "tested": meta["splits"]["test"],
            "target": meta["target"],
            "builtAt": meta["builtAt"],
        },
        open(OUT_JSON, "w", encoding="utf-8"),
        indent=2,
    )

    #
    # This file is written whole, and two things live in it that are put
    # there afterwards by `name_hotspots.py`: the twenty named places and
    # the calibration ladder. Rebuilding therefore deletes them, and it
    # did — twice in one afternoon, the second time unnoticed, which left
    # the forecast page showing an empty "twenty places to watch" and the
    # project's page a calibration chart with nothing in it.
    #
    # It still writes whole, because carrying the old names forward would
    # be worse: they would be the previous model's places, silently.
    # Instead it says plainly what has to be run next.
    #
    print("\n  hotspot names and the calibration ladder were in this file")
    print("  and are now gone. Run: python scripts/name_hotspots.py "
          f"{HORIZON}")

    print(f"\n{cells.size:,} cells above 1%   {len(blob) / 1048576:.2f} MB")
    print(f"  mean {probs.mean() / 255:.3f}   above 50%: {(probs > 127).sum():,}")
    print(f"{OUT_BIN}.gz\n{OUT_JSON}")


if __name__ == "__main__":
    main()
