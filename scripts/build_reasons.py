"""
Why this square, and not the one beside it.

The forecast hands a reader a number and asks to be believed. A number
with a reason beside it asks something different: it can be argued with.
"Eighty-seven per cent — it usually burns here at this time of year, it
has been dry all week, and something burned twelve kilometres away on
Tuesday" is a claim somebody who lives there can check against what they
already know, which a bare 87% is not.

── How the reasons are worked out ─────────────────────────────────────

For every cell and every feature: ask the model what it would have said
if that one thing about the cell were ordinary — the median of the
column across everything the forecast covers — and keep the difference.
A feature that makes the number go down when flattened is a feature that
was pushing it up, which is what "why here" means.

This is not SHAP and does not claim to be. SHAP would average over every
order in which the features might be flattened; this flattens one at a
time against a fixed baseline, which is cheaper by a factor of
thousands, and tells the truth about a model made of trees as long as
the reasons are read as "this mattered here" and not as an exact
division of the probability. Nothing on the page reads them any harder
than that.

── What is not a reason ───────────────────────────────────────────────

Latitude, and the two columns encoding the day of the year, are real
drivers and useless as explanations: "because it is at 12 degrees south"
tells a reader nothing they can do anything with. They are dropped from
the candidates rather than dropped from the model.

    python scripts/build_reasons.py [horizon]
"""

from __future__ import annotations

import gzip
import json
import struct
import sys
from pathlib import Path

import numpy as np

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7

ROWS = Path(f"models/forecast-rows-{HORIZON}d.npz")
MODEL = Path(f"models/fire-{HORIZON}d.pkl")
OUT = Path(f"public/data/world/why-{HORIZON}d.bin")

# Three fit comfortably in a sentence and a fourth never earns its place.
KEEP = 3

# Structural, not explanatory. See the note above.
MUTE = {"lat", "doy_sin", "doy_cos"}

#
# Which columns say the same thing as each other.
#
# Six windows spell "it burned here recently" and four spell "it is
# burning next door"; the model keeps them apart because a day and a
# month are different evidence, and a reader does not care. Without
# this, the three strongest columns for a cell are very often three
# lengths of the same sentence, and the card says one thing three times.
#
# Ranked within a group, then the best of each group competes, so three
# slots carry three ideas.
#
GROUP = {
    "own_1d": "recent", "own_3d": "recent", "own_7d": "recent",
    "own_14d": "lately", "own_30d": "lately", "own_90d": "lately",
    "ring_1d": "ring", "ring_3d": "ring", "ring_7d": "ring",
    "ring_30d": "ring", "clim_ring": "ring",
}

# A reason has to move the number by at least this much to be printed,
# so a cell with one real driver says one thing rather than padding to
# three with noise.
FLOOR = 0.004


def read_shipped_cells():
    """The cell indices in the grid the page actually downloads."""
    grid = Path(f"public/data/world/forecast-{HORIZON}d.bin.gz")
    if not grid.exists():
        return None
    raw = gzip.decompress(grid.read_bytes())
    (n,) = struct.unpack_from("<I", raw, 0)
    return np.frombuffer(raw, dtype="<u4", count=n, offset=4)


def main() -> None:
    import pickle

    if not ROWS.exists():
        raise SystemExit(f"{ROWS} is missing; run scripts/build_forecast.py first")

    bundle = pickle.load(open(MODEL, "rb"))
    model, names = bundle["model"], bundle["features"]

    got = np.load(ROWS, allow_pickle=True)
    cells, rows = got["cells"], got["rows"]
    all_names = [str(n) for n in got["features"]]
    pick = [all_names.index(n) for n in names]
    X = rows[:, pick]
    print(f"{len(cells):,} cells, {len(names)} features")

    base = model.predict_proba(X)[:, 1]

    # The ordinary value of each column, over the ground the forecast
    # actually covers rather than over the whole planet: the baseline a
    # reason is measured against should be somewhere fire happens.
    median = np.median(X, axis=0)

    lift = np.zeros((len(cells), len(names)), dtype=np.float32)
    for i, name in enumerate(names):
        if name in MUTE:
            continue
        flat = X.copy()
        flat[:, i] = median[i]
        lift[:, i] = base - model.predict_proba(flat)[:, 1]
        print(f"  {name:<16} mean lift {lift[:, i].mean():+.4f}")

    #
    # The top three, strongest first, as one byte each.
    #
    # 255 means "nothing more worth saying", so a cell driven by one
    # thing prints one thing. The file is read straight down beside the
    # grid, in the same order, so it needs no cell indices of its own and
    # gzips to almost nothing because neighbouring cells burn for
    # neighbouring reasons.
    #
    groups = [GROUP.get(n, n) for n in names]
    order = np.argsort(-lift, axis=1)
    out = np.full((len(cells), KEEP), 255, dtype=np.uint8)
    rank = np.arange(len(cells))
    for r in range(len(cells)):
        taken: set[str] = set()
        slot = 0
        for col in order[r]:
            if slot >= KEEP:
                break
            if lift[r, col] < FLOOR:
                break
            g = groups[col]
            if g in taken:
                continue
            taken.add(g)
            out[r, slot] = col
            slot += 1
    del rank

    #
    # Lined up against the grid that ships, not the rows that were kept.
    #
    # The two are not the same list. Making the week non-decreasing
    # raises cells in the seven-day grid to match a shorter window that
    # overtook them, and a cell raised that way has no row here and so no
    # reasons. Reading this file straight down beside the grid would then
    # shift everything after the first such cell onto the wrong place —
    # the worst kind of bug, because every number stays plausible.
    #
    shipped = read_shipped_cells()
    if shipped is not None:
        mine = {int(c): i for i, c in enumerate(cells)}
        aligned = np.full((len(shipped), KEEP), 255, dtype=np.uint8)
        found = 0
        for j, cell in enumerate(shipped):
            i = mine.get(int(cell))
            if i is not None:
                aligned[j] = out[i]
                found += 1
        print(f"\naligned to the shipped grid: {len(shipped):,} cells, "
              f"{len(shipped) - found:,} of them with no row to explain")
        cells, out = shipped, aligned

    #
    # The file says which names its bytes mean.
    #
    # A byte here is an index into the *model's* feature list, which is
    # not the canonical thirty: the fitter drops whatever the validation
    # years say is dead weight, and this model kept twenty-five. A reader
    # decoding against the canonical order gets a plausible wrong word
    # for every cell — `own_14d` read as `own_7d` — and nothing fails,
    # which is the worst way for it to be wrong. So the list travels with
    # the data instead of being agreed on in two places.
    #
    header = json.dumps(list(names), ensure_ascii=False).encode("utf-8")
    blob = (
        struct.pack("<I", len(cells))
        + bytes([KEEP])
        + struct.pack("<H", len(header))
        + header
        + out.tobytes()
    )
    packed = gzip.compress(blob, 9)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    (OUT.parent / (OUT.name + ".gz")).write_bytes(packed)

    named = (out[:, 0] != 255).mean()
    print(f"\n{len(cells):,} cells, {named * 100:.1f}% with at least one reason")
    print(f"{OUT}.gz  ({len(packed) / 1024:.0f} KB)")

    counts = np.bincount(out[:, 0][out[:, 0] != 255], minlength=len(names))
    print("\n  most common leading reason")
    for i in np.argsort(-counts)[:8]:
        if counts[i]:
            print(f"    {names[i]:<16} {counts[i]:>8,}  ({counts[i] / len(cells) * 100:.1f}%)")


if __name__ == "__main__":
    main()
