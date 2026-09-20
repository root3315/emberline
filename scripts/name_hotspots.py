"""
Name the places the forecast is most worried about.

The probability map is a picture, and a picture on its own gives the eye
nothing to hold. A short list of named places does: it turns "somewhere in
the tropics" into "Мату-Гросу, Бразилия" and lets a reader check the claim
against what they know.

── Twenty places, not twenty cells ────────────────────────────────────────

The highest twenty cells by probability are almost always twenty neighbours
in the middle of one fire, which reads as a bug and teaches nothing. So the
list is built greedily with a minimum separation: take the highest, strike
out everything within a few hundred kilometres of it, take the next. What
comes out is twenty distinct places rather than one place twenty times.

── Naming ─────────────────────────────────────────────────────────────────

The same Nominatim the site's search already uses, in reverse, at build time
rather than in the reader's browser: twenty lookups once here, instead of
twenty per visitor. Their policy asks for one request a second and an honest
user agent, and both are obliged. A cell with no name keeps its coordinates,
which is a worse label but never a wrong one.

    python scripts/name_hotspots.py [horizon] [count]
"""

from __future__ import annotations

import gzip
import json
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 20

GRID = Path(f"public/data/world/forecast-{HORIZON}d.bin.gz")
META = Path("public/data/forecast.json")
MODEL = Path(f"models/fire-{HORIZON}d.json")

APART_DEG = 4.0  # roughly 450 km at the equator
REVERSE = "https://nominatim.openstreetmap.org/reverse"
AGENT = "Emberline/1.0 (NASA Space Apps; fire activity calendar)"


def load_grid() -> tuple[list[int], list[int]]:
    raw = gzip.decompress(GRID.read_bytes())
    (n,) = struct.unpack_from("<I", raw, 0)
    cells = list(struct.unpack_from(f"<{n}I", raw, 4))
    probs = list(struct.unpack_from(f"<{n}B", raw, 4 + n * 4))
    return cells, probs


def spread(cells: list[int], probs: list[int], cols: int, deg: float, want: int) -> list[dict]:
    """
    The highest cells, no two of them neighbours, each carrying its
    neighbourhood.

    ── Why a count comes with each one ────────────────────────────────────

    The top twenty are all between ninety-seven and a hundred per cent,
    because in late September the places that burn every year are all at
    once. Ranked by that number alone the list is twenty rows of the same
    thing, and a bar drawn from it is twenty identical bars: a chart of
    nothing.

    What does vary, by more than an order of magnitude, is how much ground
    around each one is also at risk. A single hot cell in Irkutsk and three
    hundred of them across Kalimantan are not the same news, and that is the
    number worth drawing.
    """
    order = sorted(range(len(cells)), key=lambda i: -probs[i])
    here = {c: probs[i] for i, c in enumerate(cells)}

    def around(cell: int, reach: int = 8, floor: int = 128) -> int:
        """Cells within two degrees that are also more likely than not."""
        row, col = divmod(cell, cols)
        n = 0
        for dr in range(-reach, reach + 1):
            for dc in range(-reach, reach + 1):
                r, c = row + dr, (col + dc) % cols
                if 0 <= r < 720 and here.get(r * cols + c, 0) >= floor:
                    n += 1
        return n

    picked: list[dict] = []
    for i in order:
        lat = -90 + (cells[i] // cols + 0.5) * deg
        lon = -180 + (cells[i] % cols + 0.5) * deg
        if any(abs(lat - q["lat"]) < APART_DEG and abs(lon - q["lon"]) < APART_DEG for q in picked):
            continue
        picked.append(
            {
                "lat": round(lat, 3),
                "lon": round(lon, 3),
                "p": probs[i] / 255,
                "near": around(cells[i]),
            }
        )
        # Named later, so a few spare are taken: two cells four degrees apart
        # can still land in one province, and one province should appear once.
        if len(picked) >= want * 2:
            break
    return picked


def name_of(lat: float, lon: float) -> dict[str, str]:
    """
    Whose ground this is, in both languages.

    Zoom five is the level that answers with a region rather than a street or
    a continent, which is the grain the list wants.
    """
    out: dict[str, str] = {}
    for lang in ("ru", "en"):
        query = urllib.parse.urlencode(
            {"lat": f"{lat:.3f}", "lon": f"{lon:.3f}", "format": "json", "zoom": "5", "accept-language": lang}
        )
        request = urllib.request.Request(f"{REVERSE}?{query}", headers={"User-Agent": AGENT})
        try:
            with urllib.request.urlopen(request, timeout=30) as got:
                body = json.loads(got.read())
            address = body.get("address", {})
            region = (
                address.get("state")
                or address.get("region")
                or address.get("province")
                or address.get("county")
                or address.get("city")
            )
            country = address.get("country")
            out[lang] = ", ".join(p for p in (region, country) if p)
        except (urllib.error.URLError, TimeoutError, ValueError):
            out[lang] = ""
        time.sleep(1.1)  # their policy, honoured
    return out


def main() -> None:
    meta = json.loads(META.read_text(encoding="utf-8"))
    cells, probs = load_grid()
    print(f"{len(cells):,} cells in the grid, taking the top {COUNT} at least {APART_DEG} deg apart")

    candidates = spread(cells, probs, meta["cols"], meta["degrees"], COUNT)

    # Distance kept them apart on the globe; the name keeps them apart on the
    # page. Krasnoyarsk Krai is two thousand kilometres across, and three
    # cells inside it came back as three rows all reading "Krasnoyarsk Krai".
    picked: list[dict] = []
    taken: set[str] = set()
    for place in candidates:
        if len(picked) >= COUNT:
            break
        names = name_of(place["lat"], place["lon"])
        key = names.get("en") or f"{place['lat']:.1f},{place['lon']:.1f}"
        if key in taken:
            print(f"      (skipped a second {key})")
            continue
        taken.add(key)
        place["name"] = names
        picked.append(place)
        label = names.get("ru") or f"{place['lat']:.1f}, {place['lon']:.1f}"
        print(f"  {len(picked):2d}. {place['p'] * 100:4.0f}%  {place['near']:4d} near  {label}")

    meta["hotspots"] = picked

    # The calibration table earns the page its honesty, so it travels with it.
    if MODEL.exists():
        model = json.loads(MODEL.read_text(encoding="utf-8"))
        meta["reliability"] = [
            {
                "from": round(b["from"], 3),
                "to": round(b["to"], 3),
                "n": b["n"],
                "said": round(b["predicted"], 4),
                "burned": round(b["observed"], 4),
            }
            for b in model.get("reliability", [])
        ]

    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {META}")


if __name__ == "__main__":
    main()
