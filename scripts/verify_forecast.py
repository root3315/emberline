"""
Score the shipped forecast against what actually burned.

── Why this is the only number that matters ───────────────────────────────

Every figure on the forecast page comes from a held-out test split: years
the model did not see while learning, but years that were already in the
archive when the model was built. That is the right way to measure, and it
is still a measurement taken inside the laboratory.

This is the other kind. The forecast now on the site was computed on the
nineteenth for the week after it. Nobody knew what that week would do —
not the model, not the archive, not the person who built either. Asking
NASA what burned, and checking, is the one test that cannot be
accidentally rigged, because the answer did not exist when the question
was asked.

── A partial week is not a failed week ────────────────────────────────────

The window is seven days and the check can run on any day of it. Fewer
days means fewer chances to burn, so the observed rate will sit below the
predicted one for reasons that have nothing to do with the model being
wrong. The report says which day it is on and refuses to present
calibration until the week is complete; the ranking — whether the cells it
called likeliest are the ones that burned — is fair from day one.

    python scripts/verify_forecast.py
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import os
import struct
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

META = Path("public/data/forecast.json")
API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCE = "MODIS_NRT"


def key() -> str:
    for line in Path(".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(("FIRMS_MAP_KEY=", "FIRMS_MAP_KEYS=")):
            return line.split("=", 1)[1].split(",")[0].strip()
    raise SystemExit("no FIRMS key in .env")


def fetch(day: date, span: int, token: str) -> str:
    url = f"{API}/{token}/{SOURCE}/world/{span}/{day.isoformat()}"
    try:
        with urllib.request.urlopen(url, timeout=300) as got:
            return got.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        raise SystemExit(f"FIRMS refused: {err.code} {err.reason}") from err


def main() -> None:
    meta = json.loads(META.read_text(encoding="utf-8"))
    deg, cols = meta["degrees"], meta["cols"]
    start = date.fromisoformat(meta["from"])
    finish = date.fromisoformat(meta["to"])

    # NASA's near-real-time feed trails the satellite by a few hours, so the
    # current day is always partial and is counted as elapsed anyway — it
    # can only make the model look worse, never better.
    today = datetime.now(timezone.utc).date()
    last = min(finish, today)
    if last < start:
        raise SystemExit(f"the forecast window has not begun ({start} to {finish})")
    elapsed = (last - start).days + 1
    whole = last >= finish
    print(f"window {start} to {finish}; {elapsed} of 7 days elapsed{'' if whole else ', partial'}")

    raw = gzip.decompress(Path("public/data/world", meta["file"].split("/")[-1]).read_bytes())
    (n,) = struct.unpack_from("<I", raw, 0)
    cells = np.frombuffer(raw, dtype="<u4", count=n, offset=4)
    probs = np.frombuffer(raw, dtype=np.uint8, count=n, offset=4 + n * 4).astype(np.float32) / 255
    print(f"forecast: {n:,} cells above {meta['threshold'] * 100:.0f}%")

    text = fetch(start, min(elapsed, 10), key())
    reader = csv.DictReader(io.StringIO(text))
    burned: set[int] = set()
    rows = 0
    for row in reader:
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
        except (KeyError, ValueError):
            continue
        when = row.get("acq_date", "")
        if when and not (start.isoformat() <= when <= last.isoformat()):
            continue
        rows += 1
        r = int((lat + 90) / deg)
        c = int((lon + 180) / deg)
        burned.add(r * cols + c)

    print(f"NASA reports {rows:,} MODIS detections in the window so far, in {len(burned):,} cells")
    if not burned:
        raise SystemExit("nothing came back; too early in the day, or the feed is down")

    hit = np.fromiter((int(c) in burned for c in cells), dtype=bool, count=n)

    # ── ranking: did the cells it liked most burn most? ───────────────────
    order = np.argsort(-probs)
    print()
    print("  of the cells the model ranked...      burned")
    for top in (1000, 5000, 20000, n):
        take = order[:top]
        label = "all it flagged" if top == n else f"top {top:,}"
        print(f"    {label:<22} {hit[take].mean() * 100:6.1f}%")

    missed = len(burned) - int(hit.sum())
    print()
    print(f"  cells that burned and were flagged: {int(hit.sum()):,}")
    print(f"  cells that burned and were not:     {missed:,}")

    # ── calibration ───────────────────────────────────────────────────────
    #
    # On a finished week the model's number and the observed rate are the
    # same quantity and can be read side by side. On a part week they are
    # not, and printing them together would be a lie in our favour or
    # against us depending on the day.
    #
    # So a part week gets a third column instead: what the model's own
    # seven-day number implies for the days that have actually elapsed, if
    # fire arrives at a steady rate through the week. It does not — fires
    # come in runs, and the first day of a window is not a seventh of it —
    # so this is a sanity check on the order of magnitude and is labelled
    # as one. It is still worth far more than withholding the comparison.
    span = elapsed / 7.0
    print()
    if whole:
        print("  the model said      cells      actually burned")
    else:
        print(f"  the model said      cells    expected by day {elapsed}   actually burned")

    edges = [0.0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.01]
    for lo, hi in zip(edges, edges[1:]):
        band = (probs >= lo) & (probs < hi)
        if not band.any():
            continue
        said = float(probs[band].mean())
        seen = float(hit[band].mean())
        if whole:
            print(
                f"    {lo:.2f}-{min(hi, 1):.2f}   {band.sum():>9,}"
                f"   said {said:.3f}   burned {seen:.3f}"
            )
        else:
            # 1 - (1 - p) ** (fraction of the week elapsed)
            due = 1 - (1 - said) ** span
            print(
                f"    {lo:.2f}-{min(hi, 1):.2f}   {band.sum():>9,}"
                f"        {due:.3f}              {seen:.3f}"
            )

    if not whole:
        print()
        print(f"  the third column assumes fire arrives evenly across the week,")
        print(f"  which it does not. Run this again on {finish} for the real one.")


if __name__ == "__main__":
    main()
