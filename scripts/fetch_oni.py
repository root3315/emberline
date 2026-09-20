"""
El Nino, as a number per month.

The one seasonal driver worth having that costs nothing. The Oceanic Nino
Index is a single figure for the state of the tropical Pacific, and the fire
years that stand out in this archive — Indonesia 2015, the Amazon in strong
El Nino years, Australia 2019-20 — are largely the ones it flags. Seven
kilobytes against a hundred gigabytes of reanalysis, and for a seasonal signal
it carries a surprising amount of what matters.

It says nothing about whether next Tuesday is windy in Yakutia. That is what
ERA5 would be for.

    python scripts/fetch_oni.py
"""

from __future__ import annotations

import json
import os
import urllib.request

SOURCE = "https://psl.noaa.gov/data/correlation/oni.data"
OUT = "models/oni.json"
FROM = 2000


def main() -> None:
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "Emberline/1.0"})
    with urllib.request.urlopen(req, timeout=60) as fh:
        text = fh.read().decode("utf-8", "replace")

    out: dict[str, float] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 13:
            continue
        try:
            year = int(parts[0])
            values = [float(v) for v in parts[1:]]
        except ValueError:
            continue
        if year < FROM:
            continue
        for m, v in enumerate(values, start=1):
            # The file marks a month it does not have with a large sentinel.
            if v < -90:
                continue
            out[f"{year}-{m}"] = v

    if len(out) < 100:
        raise SystemExit(f"only {len(out)} months parsed - has the format changed?")

    os.makedirs("models", exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), indent=0)
    keys = sorted(out, key=lambda k: (int(k.split("-")[0]), int(k.split("-")[1])))
    print(f"{len(out)} months, {keys[0]} to {keys[-1]}")
    print(f"  strongest El Nino: {max(out, key=out.get)} ({max(out.values()):+.2f})")
    print(f"  strongest La Nina: {min(out, key=out.get)} ({min(out.values()):+.2f})")
    print(OUT)


if __name__ == "__main__":
    main()
