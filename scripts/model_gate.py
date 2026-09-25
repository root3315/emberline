"""
Whether a refitted model may take the shipped one's place.

`fit_fire_model_v2.py` writes to `-v2` names so that a losing model
cannot replace a winning one by accident, and `build_horizons.py` then
copied `-v2` over the shipped name every time. The protection was a
filename, and the next line stepped over it. This is the check that was
missing, in one place so both scripts ask the same question.

── Judged on the tuning years, not the test years ─────────────────────

The page says the test years were opened once and decided nothing. A
gate that compared test scores would make every rebuild a look at them,
so it compares the best validation average precision on 2014-2017 — the
number each fit already chose its trees and columns by.

── A new column has to earn its place ─────────────────────────────────

A refit on the same columns may ship if it is no worse. A model with a
column the shipped one does not have must beat it by `PROMOTE_MIN_GAIN`.
Population is the case this was written for: two columns that moved
validation from 0.71472 to 0.71559, +0.0009, and test from 0.5579 to
0.5581. A gain that small would have taken the model past a sentence on
the page — "it knows nothing about people" — without anyone deciding it
should.

── Two models built by different rules are not compared ───────────────

`feature_rules` names what a row was allowed to know. The models shipped
before 23 September 2026 carry none: their `cell_rate` and their choice
of cells had seen the test years. Scored against a model that has not,
they win by the size of the leak, so the gate would keep the leak
forever. It says so instead, and `build_horizons.py --release` is how a
person decides.

0.002 is about a sixth of what the whole weather block is worth: it
moves the 7-day model's test average precision from 0.546 to 0.558
(`public/data/model.json`, `without` and `scores`). The `edge` figures
beside them, 2.5% and 4.7%, are the margin over the season as a share of
the season's own score, not units of average precision.
"""

from __future__ import annotations

import json
from pathlib import Path

PROMOTE_MIN_GAIN = 0.002


def validation_ap(meta: dict) -> float | None:
    """The validation score the shipped fit was chosen on."""
    if "validate_ap" in meta:
        return float(meta["validate_ap"])
    curve = meta.get("tree_curve") or {}
    # `dropped` is only non-empty when the pruned fit won, so it says which
    # curve the model on disk came from.
    rows = curve.get("pruned" if meta.get("dropped") else "all") or []
    return max((float(r["validate_ap"]) for r in rows), default=None)


def verdict(old: dict | None, new: dict) -> tuple[bool, str]:
    """(promote?, one line saying why)."""
    if old is None:
        return True, "nothing shipped yet"
    if old.get("splits") != new.get("splits"):
        return False, "fitted on different years; compare these by hand"
    if old.get("feature_rules") != new.get("feature_rules"):
        return False, (
            f"features built by different rules ({old.get('feature_rules') or 'none stated'}"
            f" vs {new.get('feature_rules') or 'none stated'}); release by hand"
        )
    before, after = validation_ap(old), validation_ap(new)
    if before is None or after is None:
        return False, "no validation score to compare"
    added = sorted(set(new.get("features", [])) - set(old.get("features", [])))
    need = PROMOTE_MIN_GAIN if added else 0.0
    gain = after - before
    what = f"validation AP {before:.5f} -> {after:.5f} ({gain:+.5f})"
    if added:
        what += f", new columns: {', '.join(added)}, needs {need:+.4f}"
    return gain >= need, what


def read(path: str | Path) -> dict | None:
    p = Path(path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


if __name__ == "__main__":
    import sys

    # Same arguments as fit_fire_model_v2.py: [horizon] [dry]
    horizon = sys.argv[1] if len(sys.argv) > 1 else "7"
    tag = "-dry" if "dry" in sys.argv[2:] else ""
    ok, why = verdict(read(f"models/fire-{horizon}d{tag}.json"), read(f"models/fire-{horizon}d{tag}-v2.json"))
    print(f"{'promote' if ok else 'keep the shipped model'}: {why}")
