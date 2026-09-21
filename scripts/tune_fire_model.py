"""
Try the shapes of tree nobody has tried.

Every model this project has shipped used the same four numbers — a
learning rate of 0.05, thirty-one leaves, two hundred rows to a leaf and
an l2 of one. They were not chosen; they were the first thing written
down, and nothing in the repository has ever varied them. On three
million rows and twenty-five columns, thirty-one leaves is a small tree.

The reason nobody tried is that it used to cost seven minutes a fit, and
a sweep worth the name is dozens of fits. Dropping five features moved
the optimum from eighteen hundred trees to five hundred, which took a fit
down to about a minute, and a sweep became an hour instead of a day.

── How it is judged ───────────────────────────────────────────────────

Fitted on 2003-2013, scored on 2014-2017, and the test years are not
opened. Each configuration grows once with `warm_start` and is scored at
every checkpoint along the way, so the tree count is chosen per
configuration rather than fixed across them — a deeper tree wants fewer
of them, and holding the count still would be measuring the wrong thing.

The winner is printed with the current shipped numbers beside it. Putting
it into the model is a separate step, done by hand.

    python scripts/tune_fire_model.py [horizon] [dry]
"""

from __future__ import annotations

import itertools
import json
import os
import sys
import time

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7
DRY = "dry" in sys.argv[2:]
TAG = "-dry" if DRY else ""

FEATURES_NPZ = f"models/features-{HORIZON}d{TAG}.npz"
FITTED = f"models/fire-{HORIZON}d{TAG}-v2.json"
OUT = f"models/tuning-{HORIZON}d{TAG}.json"

SEED = 20260920

# What is actually in question. The rate and the leaf count are the two
# that matter on data this shape; the other two are along because they are
# free once a fit is a minute.
GRID = {
    "learning_rate": [0.03, 0.05, 0.1],
    "max_leaf_nodes": [31, 63, 127],
    "min_samples_leaf": [50, 200],
}

#
# `depth` sweeps the one knob that turned out to matter, and nothing else.
#
# The full grid put every good configuration at 127 leaves whatever the
# learning rate, so for a second model — the weather-free one, which has
# seventeen columns rather than twenty-five and wants a different depth
# because of it — three fits answer the question that eighteen answered
# the first time. The point is that both sides of the "what the weather
# bought" comparison get their own best tree, rather than one of them
# being handed the other's.
#
if "depth" in sys.argv[2:]:
    GRID = {
        "learning_rate": [0.05],
        "max_leaf_nodes": [31, 63, 127],
        "min_samples_leaf": [200],
    }
L2 = 1.0

# A deep tree reaches its best in far fewer rounds, so the ladder has to
# start low and stretch far.
CHECKPOINTS = [100, 200, 350, 500, 750, 1000, 1500, 2000]


def prior_shift(p: np.ndarray, trained_rate: float, true_rate: float) -> np.ndarray:
    eps = 1e-9
    p = np.clip(p, eps, 1 - eps)
    logit = np.log(p / (1 - p))
    shift = np.log((trained_rate / (1 - trained_rate)) / (true_rate / (1 - true_rate)))
    return 1 / (1 + np.exp(-(logit - shift)))


def main() -> None:
    d = np.load(FEATURES_NPZ, allow_pickle=True)
    X, Y, S = d["X"], d["Y"].astype(np.int8), d["S"]
    names = [str(n) for n in d["features"]]

    # The same columns the fitted model kept, so this tunes the model that
    # exists rather than a different one that happens to share its data.
    keep = list(range(len(names)))
    if os.path.exists(FITTED):
        want = json.load(open(FITTED, encoding="utf-8")).get("features")
        if want:
            keep = [names.index(n) for n in want if n in names]
    print(f"{len(keep)} features")

    tr, va = S == 0, S == 1
    Xtr, Ytr = X[tr][:, keep], Y[tr]
    Xva, Yva = X[va][:, keep], Y[va]
    tr_rate, va_rate = float(Ytr.mean()), float(Yva.mean())
    print(f"fit on {tr.sum():,}, score on {va.sum():,}\n")

    combos = [dict(zip(GRID, v)) for v in itertools.product(*GRID.values())]
    print(f"{len(combos)} configurations\n")

    results = []
    t0 = time.time()
    for i, combo in enumerate(combos, 1):
        model = HistGradientBoostingClassifier(
            loss="log_loss",
            l2_regularization=L2,
            early_stopping=False,
            warm_start=True,
            random_state=SEED,
            **combo,
        )
        best = {"validate_ap": -1.0, "trees": 0}
        for n in CHECKPOINTS:
            model.set_params(max_iter=n)
            model.fit(Xtr, Ytr)
            ap = float(
                average_precision_score(
                    Yva, prior_shift(model.predict_proba(Xva)[:, 1], tr_rate, va_rate)
                )
            )
            if ap > best["validate_ap"]:
                best = {"validate_ap": ap, "trees": n}
            # Nothing is gained by growing a configuration that peaked long
            # ago, and the deep ones are the slow ones.
            elif n >= best["trees"] * 3:
                break
        results.append({**combo, **best})
        print(
            f"  {i:>2}/{len(combos)}  lr={combo['learning_rate']:<5}"
            f" leaves={combo['max_leaf_nodes']:<4} min_leaf={combo['min_samples_leaf']:<4}"
            f" -> {best['validate_ap']:.5f} at {best['trees']} trees"
            f"   ({time.time() - t0:.0f}s)"
        )
        del model

    results.sort(key=lambda r: -r["validate_ap"])
    base = next(
        (
            r
            for r in results
            if r["learning_rate"] == 0.05
            and r["max_leaf_nodes"] == 31
            and r["min_samples_leaf"] == 200
        ),
        None,
    )

    print("\n" + "=" * 62)
    print("  best five on 2014-2017")
    for r in results[:5]:
        print(
            f"    {r['validate_ap']:.5f}  lr={r['learning_rate']} "
            f"leaves={r['max_leaf_nodes']} min_leaf={r['min_samples_leaf']} "
            f"trees={r['trees']}"
        )
    if base:
        print(f"\n  what ships now: {base['validate_ap']:.5f} at {base['trees']} trees")
        print(f"  the sweep finds: {results[0]['validate_ap']:.5f}"
              f"  ({results[0]['validate_ap'] - base['validate_ap']:+.5f})")

    json.dump({"grid": GRID, "results": results}, open(OUT, "w"), indent=2)
    print(f"\n{OUT}")


if __name__ == "__main__":
    main()
