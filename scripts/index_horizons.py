"""
Put the week back in order, without refitting anything.

`build_forecast.py` writes `forecast.json` whole, so every rebuild of the
seven-day grid deletes the three things other scripts add to that file:
the named hotspots, the calibration ladder, and the index of the shorter
horizons. The first two are cheap to restore. This is the third.

It also redoes the part of `build_horizons.py` that is not the two hours
of fitting: making the grids non-decreasing across the week. "By
Wednesday" contains "by Tuesday", so a longer window cannot read lower
than a shorter one, and seven separately fitted models do not know that
about each other. Rebuilding the seven-day grid alone breaks the
agreement again even though none of the models changed, which is why
this is a script and not a paragraph in a runbook.

    python scripts/index_horizons.py [longest]
"""

from __future__ import annotations

import gzip
import json
import struct
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_fire_model import LAST  # noqa: E402

LONGEST = int(sys.argv[1]) if len(sys.argv) > 1 else 7
META = Path("public/data/forecast.json")


def grid_path(h: int) -> Path:
    return Path(f"public/data/world/forecast-{h}d.bin.gz")


def read_grid(h: int) -> dict[int, int]:
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
    tables = {h: read_grid(h) for h in range(1, LONGEST + 1) if grid_path(h).exists()}
    order = sorted(tables)
    if len(order) < 2:
        raise SystemExit("only one horizon on disk; run scripts/build_horizons.py first")

    raised = 0
    for i in range(len(order) - 1, 0, -1):
        longer, shorter = tables[order[i]], tables[order[i - 1]]
        for cell, value in shorter.items():
            if value > longer.get(cell, 0):
                longer[cell] = value
                raised += 1
    print(f"{raised:,} cells raised so no longer window reads lower than a shorter one")

    counts = {}
    for h in order:
        counts[h] = write_grid(h, tables[h])
        print(f"  {h}d: {counts[h]:,} cells")

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
    # The seven-day grid may have grown during the pass above, and the
    # figure in the headline is read from here.
    meta["cells"] = counts[order[-1]]
    META.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {META}  ({len(order)} horizons)")


if __name__ == "__main__":
    main()
