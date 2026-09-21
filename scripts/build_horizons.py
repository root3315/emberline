"""
The shorter weeks: a model each, and an index the page can read.

The model answers one question — will this cell see a MODIS detection in
the next N days — so a reader who wants to know about Tuesday needs a
model that was asked about Tuesday. This builds one per horizon from one
to the full week, using the pipeline that was already parameterised by
horizon, and writes the index the day strip reads.

── Why the numbers must not go down ───────────────────────────────────

"By Wednesday" contains "by Tuesday": a fire that has arrived by Tuesday
has arrived by Wednesday, so the probability cannot fall as the window
grows. Seven separately fitted models do not know that about each other
and will break it here and there — a cell at 0.42 by Tuesday and 0.41 by
Wednesday, which is noise, but noise a reader would watch happen and
reasonably call a bug.

So the grids are read back at the end and made non-decreasing across
horizons, cell by cell. It only ever raises a shorter window to meet a
longer one it had overtaken, which is the direction that keeps every
number a lower bound on what the longer model said.

── What it costs ──────────────────────────────────────────────────────

A feature build is the expensive part, about ten minutes, and there is
one per horizon because the label and the weather window both move with
it. Everything else — the climatology, the neighbourhood sums — is the
same arithmetic recomputed, which is wasteful and is the price of not
rewriting the training script.

    python scripts/build_horizons.py [longest]
"""

from __future__ import annotations

import gzip
import json
import shutil
import struct
import subprocess
import sys
import time
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_fire_model import LAST  # noqa: E402

LONGEST = int(sys.argv[1]) if len(sys.argv) > 1 else 7
PY = sys.executable
META = Path("public/data/forecast.json")


def run(args: list[str]) -> None:
    print(f"    $ {' '.join(args)}")
    done = subprocess.run([PY, "-u", *args])
    if done.returncode != 0:
        raise SystemExit(f"failed: {' '.join(args)}")


def grid_path(h: int) -> Path:
    return Path(f"public/data/world/forecast-{h}d.bin.gz")


def read_grid(h: int) -> dict[int, int]:
    """Cell index to probability byte."""
    raw = gzip.decompress(grid_path(h).read_bytes())
    (n,) = struct.unpack_from("<I", raw, 0)
    cells = struct.unpack_from(f"<{n}I", raw, 4)
    probs = struct.unpack_from(f"<{n}B", raw, 4 + n * 4)
    return dict(zip(cells, probs))


def write_grid(h: int, table: dict[int, int]) -> int:
    keep = sorted(k for k, v in table.items() if v > 0)
    blob = struct.pack("<I", len(keep))
    blob += struct.pack(f"<{len(keep)}I", *keep)
    blob += struct.pack(f"<{len(keep)}B", *(table[k] for k in keep))
    grid_path(h).write_bytes(gzip.compress(blob, 9))
    return len(keep)


def main() -> None:
    started = time.time()

    # One fetch of GFS, cut into the shorter windows.
    run(["scripts/slice_weather.py", str(LONGEST)])

    for h in range(1, LONGEST):
        print(f"\n── {h} day{'s' if h > 1 else ''} " + "─" * 46)
        run(["scripts/train_fire_model.py", str(h)])
        run(["scripts/fit_fire_model_v2.py", str(h)])
        # The forecast build reads the plain names; `-v2` is where the
        # fitter writes so that a losing model cannot take the place of a
        # winning one by accident.
        for ext in ("pkl", "json"):
            shutil.copy(f"models/fire-{h}d-v2.{ext}", f"models/fire-{h}d.{ext}")
        run(["scripts/build_forecast.py", str(h), "secondary"])

    # ── make the week monotone ─────────────────────────────────────────
    print("\n── the running total " + "─" * 44)
    tables = {h: read_grid(h) for h in range(1, LONGEST + 1) if grid_path(h).exists()}
    order = sorted(tables)
    raised = 0
    for i in range(len(order) - 1, 0, -1):
        longer, shorter = tables[order[i]], tables[order[i - 1]]
        for cell, value in shorter.items():
            if value > longer.get(cell, 0):
                longer[cell] = value
                raised += 1
    print(f"  {raised:,} cells raised so no longer window reads lower than a shorter one")

    counts = {}
    for h in order:
        counts[h] = write_grid(h, tables[h])
        print(f"  {h}d: {counts[h]:,} cells")

    # ── the index the page reads ───────────────────────────────────────
    meta = json.loads(META.read_text(encoding="utf-8"))
    meta["horizons"] = [
        {
            "days": h,
            "file": f"world/forecast-{h}d.bin.gz",
            "from": str(LAST + timedelta(days=1)),
            "to": str(LAST + timedelta(days=h)),
            "cells": counts[h],
        }
        for h in order
    ]
    META.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # The named places and the calibration ladder live in the same file and
    # are put there by a separate script, so anything that rewrites the
    # file has to put them back. Last in the chain, after the index, since
    # it reads the file it is adding to.
    run(["scripts/name_hotspots.py", str(LONGEST)])
    print(f"\nwrote {META}  ({len(order)} horizons)  in {(time.time() - started) / 60:.0f} min")


if __name__ == "__main__":
    main()
