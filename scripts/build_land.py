"""
The shape of the continents, as a bitmask, for drawing a globe out of dots.

── Why not a map of coastlines ────────────────────────────────────────────

A vector coastline is the obvious way to draw a world, and it is the wrong
one here. Every other picture on this site is made of cells — the calendar,
the ribbon, the map, the forecast — because the data is made of cells and
pretending otherwise would be a flattery. A globe stippled from the same
kind of grid says what it is: this is not a photograph of the Earth, it is
a lattice of squares that either hold land or do not, and the bright ones
are where something is expected to burn.

It is also a hundredth of the weight. Natural Earth's coastline at this
detail is a megabyte of GeoJSON; half a degree of land or not-land is
259,200 bits, which is thirty-two kilobytes before compression and about
eight after.

── Half a degree ──────────────────────────────────────────────────────────

Fine enough that Italy has a boot and the Great Lakes are holes, coarse
enough that the whole visible hemisphere can be drawn every frame. The
renderer thins it further when the globe is small.

    python scripts/build_land.py
"""

from __future__ import annotations

import gzip
import json
import struct
import urllib.request
from pathlib import Path

import numpy as np
import numcodecs

SOURCE = (
    "https://storage.googleapis.com/gcp-public-data-arco-era5/ar/"
    "1959-2022-6h-1440x721.zarr"
)
OUT = Path("public/data/land.bin.gz")
DEG = 0.5
COLS, ROWS = int(360 / DEG), int(180 / DEG)


def chunk(meta: dict, variable: str, index: str) -> np.ndarray:
    spec = meta[f"{variable}/.zarray"]
    codec = numcodecs.get_codec(spec["compressor"])
    with urllib.request.urlopen(f"{SOURCE}/{variable}/{index}", timeout=180) as got:
        raw = got.read()
    return np.frombuffer(codec.decode(raw), dtype=spec["dtype"]).reshape(spec["chunks"])


def main() -> None:
    with urllib.request.urlopen(f"{SOURCE}/.zmetadata", timeout=120) as got:
        meta = json.loads(got.read())["metadata"]

    spec = meta["land_sea_mask/.zarray"]
    print(f"source {spec['shape']}, chunks {spec['chunks']}")
    field = np.squeeze(chunk(meta, "land_sea_mask", "0.0"))
    if field.ndim == 3:
        field = field[0]
    print(f"read {field.shape}, {float(np.nanmin(field)):.2f} to {float(np.nanmax(field)):.2f}")

    # The archive is (longitude, latitude), counting latitude down from the
    # north pole and longitude up from Greenwich. The page counts the other
    # way on both, so both are turned here rather than in the browser.
    if field.shape[0] < field.shape[1]:
        field = field.T  # (lat, lon) -> (lon, lat) if it came the other way
    n_lon, n_lat = field.shape
    field = field[:, ::-1]  # latitude now runs south to north

    # 0.25 degrees down to 0.5: a block counts as land if any quarter of it is.
    per_lon, per_lat = n_lon // COLS, (n_lat - 1) // ROWS
    trimmed = field[: COLS * per_lon, : ROWS * per_lat]
    blocks = trimmed.reshape(COLS, per_lon, ROWS, per_lat).max(axis=(1, 3))
    land = blocks > 0.5

    # Greenwich-first becomes date-line-first, to match every other grid here.
    land = np.roll(land, COLS // 2, axis=0)

    # Row-major by latitude, so the renderer walks rows of constant latitude.
    flat = np.ascontiguousarray(land.T).ravel()
    packed = np.packbits(flat)

    head = struct.pack("<HHf", COLS, ROWS, DEG)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(gzip.compress(head + packed.tobytes(), 9))
    print(
        f"wrote {OUT}  {COLS}x{ROWS} at {DEG} deg, "
        f"{int(flat.sum()):,} land cells, {OUT.stat().st_size / 1024:.1f} KB"
    )


if __name__ == "__main__":
    main()
