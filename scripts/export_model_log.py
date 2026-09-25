"""
The model's record, small enough to commit.

`models/` is not in git: it holds pickles, three gigabytes of feature
matrices and a weather archive. But the about page quotes numbers from
it — the tree curve, the tuning grid, the population experiment, the
calibration curves that did not ship — and "every number here can be
recomputed" means nothing if the only copy of those is a string in
`src/i18n.ts`.

This carries the measurements out of `models/` into docs/model-log.json:
the scores and choices of every shipped horizon, and the three rejected
experiments with the numbers that rejected them. No weights, no rows —
only what a reader would need to check the page against.

    python scripts/export_model_log.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from model_gate import PROMOTE_MIN_GAIN, read, validation_ap, verdict

OUT = Path("docs/model-log.json")
HORIZONS = ["1", "2", "3", "4", "5", "6", "7", "7-dry"]


def shipped(meta: dict) -> dict:
    s = meta["scores"]
    return {
        "features": meta["features"],
        "dropped": meta.get("dropped", []),
        "trees": meta["trees"],
        "validate_ap": validation_ap(meta),
        "test": {
            "model_ap": s["model"]["average_precision"],
            "model_roc_auc": s["model"].get("roc_auc"),
            "model_brier": s["model"].get("brier"),
            "climatology_ap": s["climatology"]["average_precision"],
            "persistence_ap": s["persistence"]["average_precision"],
            "base_rate": s["always_no"]["average_precision"],
        },
        "splits": meta["splits"],
        "builtAt": meta.get("builtAt"),
    }


def ranks(meta: dict, names: list[str]) -> dict:
    order = [r["feature"] for r in meta["importance"]]
    return {
        n: {"rank": order.index(n) + 1, "of": len(order),
            "ap_drop": meta["importance"][order.index(n)]["ap_drop"]}
        for n in names if n in order
    }


def main() -> None:
    log: dict = {
        "about": "Measurements behind the model section of the about page. "
                 "Written by scripts/export_model_log.py from models/, which is not committed.",
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "shipped": {},
        "experiments": {},
    }

    for h in HORIZONS:
        tag = f"{h}d" if "-" not in h else h.replace("-", "d-")
        meta = read(f"models/fire-{tag}.json")
        if meta:
            log["shipped"][tag] = shipped(meta)

    main7 = read("models/fire-7d.json")
    if main7:
        log["experiments"]["trees"] = {
            "question": "does a longer boosting run help?",
            "curve": main7["tree_curve"]["pruned" if main7.get("dropped") else "all"],
            "note": "validation average precision, 2014-2017",
        }
        log["importance_7d"] = main7["importance"]

    tuning = read("models/tuning-7d.json")
    if tuning:
        log["experiments"]["tuning"] = {
            "question": "which tree shape?",
            "grid": tuning["grid"],
            "results": sorted(tuning["results"], key=lambda r: -r["validate_ap"]),
        }

    pop = read("models/fire-7d-v2.json")
    if main7 and pop and set(pop["features"]) - set(main7["features"]):
        ok, why = verdict(main7, pop)
        log["experiments"]["population"] = {
            "question": "does population per cell help?",
            "added": sorted(set(pop["features"]) - set(main7["features"])),
            "validate_ap": {"without": validation_ap(main7), "with": validation_ap(pop)},
            "test_ap": {"without": main7["scores"]["model"]["average_precision"],
                        "with": pop["scores"]["model"]["average_precision"]},
            "importance": ranks(pop, ["pop", "pop_ring", "clim"]),
            "bar": PROMOTE_MIN_GAIN,
            "shipped": ok,
            "verdict": why,
        }

    cal = read("models/calibration-7d.json")
    if cal:
        log["experiments"]["calibration"] = {"question": "does a fitted calibration curve help?", **cal}

    # LF like the rest of the repository; text mode on Windows would write CRLF.
    OUT.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"{OUT}: {len(log['shipped'])} horizons, experiments: {', '.join(log['experiments'])}")


if __name__ == "__main__":
    main()
