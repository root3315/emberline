"""
Repack the weather archive so training can read it a tile at a time.

── The problem this solves ────────────────────────────────────────────────

`weather-history.npz` is one file holding three arrays of 7,305 days by
29,040 cells. Opening it means decompressing all of it into memory — two
and a half gigabytes — and the training pass needs perhaps fifty cells of
it at a time. On a machine with a gigabyte and a half free that is not a
performance question, it is whether the run finishes.

Plain `.npy` files can be memory-mapped: the operating system pages in the
bytes actually touched and nothing else. Same numbers, same order, read
lazily.

── And why float16 ────────────────────────────────────────────────────────

Half precision carries about three significant figures, which is more than
a reanalysis of daily maximum temperature deserves — ERA5's own error is
larger than the rounding. It halves what has to be read, and the training
script casts back to float32 on the way in, so nothing downstream knows.

── The year that is not there ─────────────────────────────────────────────

The mirror is named for 1959-2022 and its time axis stops on the last day
of 2021: 92,040 six-hourly steps from 1959 is exactly sixty-three years.
Every step asked for in 2022 came back a 404 and was filled with NaN, so
that year is dropped here rather than carried as a hole. The model's split
moves with it — train 2003-2013, validate 2014-2017, test 2018-2021.

    python scripts/pack_weather.py
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import numpy as np

SOURCE = Path("models/weather-history.npz")
OUT = Path("models/weather")
FIELDS = ("tmax", "wind", "rain")
LAST_GOOD = date(2021, 12, 31)


def main() -> None:
    got = np.load(SOURCE)
    first = date.fromisoformat(str(got["first"]))
    last = date.fromisoformat(str(got["last"]))
    keep = (min(last, LAST_GOOD) - first).days + 1
    print(f"{first} to {last}; keeping {keep:,} days, to {first + timedelta(days=keep - 1)}")

    OUT.mkdir(parents=True, exist_ok=True)
    np.save(OUT / "lat.npy", np.asarray(got["lat"], dtype=np.float32))
    np.save(OUT / "lon.npy", np.asarray(got["lon"], dtype=np.float32))

    for name in FIELDS:
        block = got[name][:keep]
        holes = int(np.isnan(block).sum())
        if holes:
            print(f"  {name}: {holes:,} holes remain in the kept range")
        path = OUT / f"{name}.npy"
        np.save(path, block.astype(np.float16))
        print(f"  {name}: {block.shape} -> {path} ({path.stat().st_size / 1e9:.2f} GB)")
        del block

    meta = {"first": str(first), "days": keep, "degrees": 1.5}
    (OUT / "meta.json").write_text(
        "{\n" + ",\n".join(f'  "{k}": {v!r}'.replace("'", '"') for k, v in meta.items()) + "\n}\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT / 'meta.json'}")


if __name__ == "__main__":
    main()
