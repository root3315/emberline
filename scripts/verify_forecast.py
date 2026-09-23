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
# Cells to a tile side, from public/data/world/days-index.json.
TILE_CELLS = 40
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



# The page reads this; the terminal output above is for whoever ran it.
OUT_JSON = Path("public/data/verify.json")
# And this, which is the same thing for every week that was ever checked.
OUT_LOG = Path("public/data/verify-history.json")
NEWLINE = chr(10)


DAYS_DIR = Path("public/data/world/days")
DAY_REC = np.dtype([("cell", "<u2"), ("day", "<u2"), ("modis", "<u2"), ("viirs", "<u2")])


def burned_before(asof: date, span: int, cols: int, rows: int) -> np.ndarray:
    """
    How many of the `span` days ending on `asof` each cell was alight.

    This is persistence: "it burned last week, so it will burn next week".
    It costs nothing, needs no model, and over a seven-day window it is not
    a weak opponent — which is exactly why the prospective check needs it
    standing next to the model rather than only in the test-year table.

    Read from `public/data/world/days`, the same daily tiles the calendar
    draws, so it is on the forecast's own grid by construction and cannot
    drift out of alignment with it the way a saved feature matrix can.

    Tile rows count from the south, as the forecast's own indexing does.
    Checked against geography rather than assumed: tile 25-12 carries
    Punjab, and its year peaks in May and again in late October, which is
    the two stubble seasons the region is known for. The northern reading
    of the same tile is empty.
    """
    want: dict[int, set[int]] = {}
    for back in range(span):
        d = asof - timedelta(days=back)
        want.setdefault(d.year, set()).add(d.timetuple().tm_yday - 1)

    hits = np.zeros(rows * cols, dtype=np.uint8)
    if not DAYS_DIR.exists():
        return hits

    for year, doys in want.items():
        bucket = 2000 + 5 * ((year - 2000) // 5)
        for path in sorted(DAYS_DIR.glob(f"*-{bucket}.bin.gz")):
            tx, ty, _ = path.name.removesuffix(".bin.gz").split("-")
            tx, ty = int(tx), int(ty)
            raw = gzip.decompress(path.read_bytes())
            (blocks,) = struct.unpack_from("<H", raw, 0)
            at = 2
            for _ in range(blocks):
                block_year, count = struct.unpack_from("<HI", raw, at)
                at += 6
                if block_year != year or count == 0:
                    at += count * 8
                    continue
                rec = np.frombuffer(raw, dtype=DAY_REC, count=count, offset=at)
                at += count * 8
                keep = np.isin(rec["day"], list(doys)) & (rec["modis"] > 0)
                if not keep.any():
                    continue
                local = rec["cell"][keep].astype(np.int64)
                r = ty * TILE_CELLS + local // TILE_CELLS
                c = tx * TILE_CELLS + local % TILE_CELLS
                np.add.at(hits, r * cols + c, 1)
    return hits


def remember(report: dict) -> int:
    """
    Add this week to the record, and return how many weeks are in it.

    Keyed by the forecast window, so running the check again on a later
    day of the same week replaces that week's row instead of adding one.
    Only the parts worth keeping: the ladder, the free baseline, and the
    dates that make it a forecast rather than a hindcast.
    """
    log: list[dict] = []
    if OUT_LOG.exists():
        try:
            held = json.loads(OUT_LOG.read_text(encoding="utf-8"))
            if isinstance(held, dict):
                held = held.get("weeks", [])
            log = [w for w in held if isinstance(w, dict) and w.get("from")]
        except (ValueError, OSError) as err:
            # A corrupt log must not take the run with it, but silently
            # starting a fresh one would quietly lose the record.
            print(f"  ({OUT_LOG.name} could not be read: {err}; leaving it alone)")
            return 0

    row = {
        k: report[k]
        for k in ("from", "to", "computed", "checked", "elapsed", "whole",
                  "flagged", "detections", "burnedCells", "caught", "missed")
        if k in report
    }
    row["ranking"] = report.get("ranking", [])
    if report.get("baselines"):
        row["baselines"] = report["baselines"]

    log = [w for w in log if w["from"] != row["from"]] + [row]
    log.sort(key=lambda w: w["from"])
    OUT_LOG.write_text(
        json.dumps({"weeks": log}, ensure_ascii=False, indent=1) + NEWLINE,
        encoding="utf-8",
    )
    return len(log)


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
    report = {
        "from": str(start),
        "to": str(finish),
        "elapsed": elapsed,
        "whole": whole,
        "flagged": int(n),
        "detections": int(rows),
        "burnedCells": len(burned),
        # Two different days, and the page needs both: the one the
        # forecast was computed on, which is what makes it a forecast,
        # and the one this check ran on, which is what makes it fresh.
        "computed": str(meta["asOf"]),
        "checked": str(date.today()),
    }
    if not burned:
        raise SystemExit("nothing came back; too early in the day, or the feed is down")

    hit = np.fromiter((int(c) in burned for c in cells), dtype=bool, count=n)

    # ── ranking: did the cells it liked most burn most? ───────────────────
    tops = (1000, 5000, 20000, n)
    order = np.argsort(-probs)
    report["ranking"] = []
    for top in tops:
        report["ranking"].append({"top": int(top), "burned": float(hit[order[:top]].mean())})

    # ── the same ladder, for two things that cost nothing ─────────────────
    #
    # The skill table on the page compares the model against climatology
    # and persistence, and does it on the held-out test years. Those are
    # laboratory numbers. This check is the one measurement taken before
    # the answer existed, and until now it had nothing beside it — so the
    # obvious question, "what would 'it burned last week' have given you?",
    # had no answer on the page at all.
    #
    # Both baselines are columns the model was handed anyway, saved with
    # the feature rows, so this costs one file read and no new data.
    #
    # Ties matter here in a way they do not for the model: most cells have
    # not burned in the last seven days, so persistence scores are mostly
    # equal and a stable sort would hand the front of its list to whatever
    # order the grid happens to be in — which is latitude, and would look
    # like skill. They are broken at random, once, from a fixed seed.
    report["baselines"] = {}
    jitter = np.random.default_rng(20260919).random(n)

    def ladder(score: np.ndarray) -> list[dict[str, float]]:
        ranked = np.lexsort((jitter, -score))
        return [{"top": int(top), "burned": float(hit[ranked[:top]].mean())} for top in tops]

    # Persistence, from the shipped daily tiles: always on this grid.
    recent = burned_before(date.fromisoformat(meta["asOf"]), meta["horizonDays"], cols, meta["rows"])
    if recent.any():
        report["baselines"]["persistence"] = ladder(recent[cells].astype(np.float64))

    # Climatology only if the saved feature rows still describe these cells.
    # They are written by `build_forecast.py`, so a forecast rebuilt since
    # leaves them behind, and a mismatched matrix would silently rank the
    # wrong cells.
    rows_at = Path("models/forecast-rows-7d.npz")
    if rows_at.exists():
        saved = np.load(rows_at)
        names = [str(x) for x in saved["features"]]
        if not np.array_equal(saved["cells"], cells):
            print(f"{NEWLINE}  ({rows_at.name} is from an older build; climatology skipped)")
        elif "clim" in names:
            report["baselines"]["climatology"] = ladder(
                saved["rows"][:, names.index("clim")].astype(np.float64)
            )

    print()
    head = "  of the cells ranked highest by...   "
    cols_ = [("the model", report["ranking"])]
    for tag in ("persistence", "climatology"):
        if report["baselines"].get(tag):
            cols_.append((tag, report["baselines"][tag]))
    print(head + "".join(f"{name:>14}" for name, _ in cols_))
    for i, top in enumerate(tops):
        label = "all it flagged" if top == n else f"top {top:,}"
        cells_txt = "".join(f"{series[i]['burned'] * 100:13.1f}%" for _, series in cols_)
        print(f"    {label:<32}{cells_txt}")

    missed = len(burned) - int(hit.sum())
    report["caught"] = int(hit.sum())
    report["missed"] = int(missed)
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

    report["bands"] = []
    edges = [0.0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.01]
    for lo, hi in zip(edges, edges[1:]):
        band = (probs >= lo) & (probs < hi)
        if not band.any():
            continue
        said = float(probs[band].mean())
        seen = float(hit[band].mean())
        report["bands"].append({
            "from": lo,
            "to": min(hi, 1.0),
            "n": int(band.sum()),
            "said": said,
            "burned": seen,
            # What the seven-day number implies for the days that have
            # actually passed, if fire arrived at a steady rate. It does
            # not, so this is an order-of-magnitude check and the page
            # labels it as one.
            "dueByNow": float(1 - (1 - said) ** span),
        })
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
        print("  the third column assumes fire arrives evenly across the week,")
        print(f"  which it does not. Run this again on {finish} for the real one.")

    #
    # Written where the site can read it.
    #
    # Everything else on the forecast page is a measurement taken before
    # the week began. This is the one number that could not have been
    # arranged, and a number like that is worth nothing sitting in a
    # terminal on one laptop.
    #
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    weeks = remember(report)
    print(f"{NEWLINE}wrote {OUT_JSON}")
    if weeks:
        print(f"wrote {OUT_LOG}  ({weeks} week{'' if weeks == 1 else 's'} on record)")


if __name__ == "__main__":
    main()
