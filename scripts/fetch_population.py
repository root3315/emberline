"""
Where the people are, which is the biggest thing this model cannot see.

Every feature it has is about fire: where fire has been, when fire is
usual, what the weather will do to whatever is there to burn. Not one of
them is about people — and most fire on this planet is lit by somebody.
Stubble after harvest, clearing for a field, a cooking fire that got
away. The model infers all of that from where fire has happened before,
which works exactly until the pattern changes, and a pattern of human
behaviour is the kind that changes.

── The source ─────────────────────────────────────────────────────────

GHSL, the European Commission's global settlement layer: population per
cell for the whole planet, free, no key. The 30 arc-second product is
already in the same coordinates as this project — plain latitude and
longitude — and thirty of its cells to a side make exactly one of ours,
so the aggregation is a sum over a 30x30 block with no resampling and no
interpolation to argue about.

── Read in strips ─────────────────────────────────────────────────────

The raster is 43,200 by 21,600. As float32 that is three and a half
gigabytes, and this machine has run out of memory once already today.
`rasterio` reads windows, so it is taken thirty rows at a time — five
megabytes in flight — and summed into the output as it goes.

    python scripts/fetch_population.py
"""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

import numpy as np

URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/"
    "GHS_POP_E2020_GLOBE_R2023A_4326_30ss/V1-0/"
    "GHS_POP_E2020_GLOBE_R2023A_4326_30ss_V1_0.zip"
)

SCRATCH = Path("models/ghsl")
OUT = Path("models/population.npz")

DEGREES = 0.25
COLS, ROWS = int(360 / DEGREES), int(180 / DEGREES)

# 30 arc-seconds is 1/120 of a degree, so a quarter degree is thirty of
# them. Asserted rather than assumed, because a different product would
# silently produce a shifted world.
PER = 30


def download() -> Path:
    """Fetch and unpack, without ever holding either whole.

    Two ways to run out of memory were in the first version of this and
    both are worth naming. `z.read()` decompresses the entire GeoTIFF
    into a bytes object before writing a single byte of it, and that
    object is three and a half gigabytes. And a download interrupted
    part-way leaves a file that passes any "is it there and non-trivial"
    check, so the next run unzips a truncated archive and fails somewhere
    much less obvious than the download.
    """
    SCRATCH.mkdir(parents=True, exist_ok=True)
    zip_at = SCRATCH / "ghs_pop.zip"

    import urllib.request

    want = 0
    with urllib.request.urlopen(URL, timeout=120) as head:
        want = int(head.headers.get("Content-Length") or 0)

    if zip_at.exists() and want and zip_at.stat().st_size == want:
        print(f"using the cached {zip_at} ({want / 1048576:.0f} MB)")
    else:
        print(f"downloading {URL.rsplit('/', 1)[-1]} ({want / 1048576:.0f} MB)")
        part = zip_at.with_suffix(".part")
        with urllib.request.urlopen(URL, timeout=120) as got, open(part, "wb") as fh:
            done = 0
            while chunk := got.read(1 << 20):
                fh.write(chunk)
                done += len(chunk)
                if done % (50 << 20) < (1 << 20):
                    print(f"  {done / 1048576:.0f} MB")
        if want and part.stat().st_size != want:
            part.unlink()
            raise SystemExit(f"got {done} bytes of {want}; the download was cut short")
        # Named only once it is whole, so a cut-short run cannot be
        # mistaken for a cached one.
        part.replace(zip_at)

    with zipfile.ZipFile(zip_at) as z:
        tif = next(n for n in z.namelist() if n.lower().endswith(".tif"))
        at = SCRATCH / Path(tif).name
        if not at.exists():
            print(f"unzipping {tif}")
            part = at.with_suffix(".part")
            with z.open(tif) as src, open(part, "wb") as fh:
                shutil.copyfileobj(src, fh, 1 << 22)
            part.replace(at)
    return at


def main() -> None:
    try:
        import rasterio
    except ImportError:
        raise SystemExit("needs rasterio: pip install rasterio") from None

    tif = download()
    with rasterio.open(tif) as src:
        print(f"{src.width} x {src.height}, {src.dtypes[0]}")
        if src.width != COLS * PER or src.height != ROWS * PER:
            raise SystemExit(
                f"expected {COLS * PER} x {ROWS * PER} for a {DEGREES} degree grid at "
                f"{PER} cells a side; this raster is {src.width} x {src.height}"
            )

        # Rows run north to south in the file and south to north in this
        # project's grid, so the output is filled from the bottom up.
        pop = np.zeros((ROWS, COLS), dtype=np.float32)
        nodata = src.nodata
        for r in range(ROWS):
            band = src.read(
                1, window=rasterio.windows.Window(0, r * PER, src.width, PER)
            ).astype(np.float32)
            if nodata is not None:
                band[band == nodata] = 0.0
            band[band < 0] = 0.0
            pop[ROWS - 1 - r] = band.reshape(PER, COLS, PER).sum(axis=(0, 2))
            if r % 200 == 0:
                print(f"  row {r}/{ROWS}  {pop.sum() / 1e9:.2f} billion so far")

    total = float(pop.sum())
    print(f"\n{total / 1e9:.2f} billion people, {(pop > 0).mean() * 100:.1f}% of cells inhabited")
    if not 6e9 < total < 9e9:
        print("  WARNING: that is not a plausible world population; check the product")

    # The eight neighbours, summed. A cell with nobody in it and a town
    # next door is not the same as a cell with nobody in it for a hundred
    # kilometres, and the archive features already treat the ring this way.
    ring = np.zeros_like(pop)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            ring += np.roll(np.roll(pop, dy, axis=0), dx, axis=1)

    np.savez_compressed(
        OUT,
        pop=np.log1p(pop).astype(np.float32),
        ring=np.log1p(ring).astype(np.float32),
        degrees=np.float32(DEGREES),
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
