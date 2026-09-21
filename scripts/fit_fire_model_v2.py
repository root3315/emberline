"""
The same model, fitted properly, and kept only if it wins.

Nothing here changes what the model is told — same rows, same thirty
columns to choose from, same target. Two things about *how* it is fitted
were wrong, and this fixes them.

── The stopping rule was scored on the answers ────────────────────────────

`fit_fire_model.py` asks for `early_stopping=True` with
`validation_fraction=None`, having stacked train and validation into one
matrix. That combination tells sklearn to judge the stopping rule on the
training data itself, and a boosting run's training loss improves more or
less forever, so the rule never fires: both shipped models report exactly
1,500 trees, which is the cap they were given, not a plateau they found.
They were still learning when the run was cut off.

The script's own comment says the stopping point should be chosen "on
years the model has not seen". This does that: it grows one model on
2003-2013 with `warm_start`, scores the held-out 2014-2017 at every
checkpoint, and takes the count that curve actually likes.

── Seven of the thirty features were making it worse ──────────────────────

Shuffling a feature and watching average precision *rise* means the model
is leaning on noise. Seven columns do that. But the published ranking was
measured on the test years, so picking features by it and then reporting
the test score would be marking one's own homework — the selection is
redone here on 2014-2017 and the test years are not looked at until the
end.

Validation rows are inside the final fit, which makes this measurement
optimistic about every feature and therefore *conservative* about
dropping any: it will keep some bad ones rather than throw away good
ones. Whatever survives that is real.

── Nothing is replaced until it has won ───────────────────────────────────

Output goes to `-v2` names. The shipped model stays exactly where it is,
and the last thing printed is the comparison that decides whether the new
one deserves to take its place.

    python scripts/fit_fire_model_v2.py [horizon]
"""

from __future__ import annotations

import json
import os
import pickle
import sys
import time
from datetime import datetime, timezone

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_fire_model import ERAS as _ERAS  # noqa: E402

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7
ERAS = [_ERAS[i] for i in (0, 1, 2)]

FEATURES_NPZ = f"models/features-{HORIZON}d.npz"
OLD_META = f"models/fire-{HORIZON}d.json"
OUT_MODEL = f"models/fire-{HORIZON}d-v2.pkl"
OUT_META = f"models/fire-{HORIZON}d-v2.json"

SEED = 20260920

# Where to look along the boosting curve. Sparse early, because nothing is
# decided there, and out past the old cap because the old cap is the thing
# under suspicion.
CHECKPOINTS = [250, 500, 750, 1000, 1250, 1500, 1800, 2100, 2500, 3000]

PARAMS = dict(
    loss="log_loss",
    learning_rate=0.05,
    max_leaf_nodes=31,
    min_samples_leaf=200,
    l2_regularization=1.0,
    early_stopping=False,
    random_state=SEED,
)


def prior_shift(p: np.ndarray, trained_rate: float, true_rate: float) -> np.ndarray:
    """Move probabilities from the sampled base rate back to the real one."""
    eps = 1e-9
    p = np.clip(p, eps, 1 - eps)
    logit = np.log(p / (1 - p))
    shift = np.log((trained_rate / (1 - trained_rate)) / (true_rate / (1 - true_rate)))
    return 1 / (1 + np.exp(-(logit - shift)))


def reliability(p, y, edges=(0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.0)):
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi) if hi < 1 else (p >= lo)
        if m.sum() < 50:
            continue
        rows.append((lo, hi, int(m.sum()), float(p[m].mean()), float(y[m].mean())))
    return rows


def grow(Xtr, Ytr, Xva, Yva, tr_rate, va_rate, label):
    """Grow one model, scoring the held-out years as it goes.

    `warm_start` means each checkpoint continues the previous one rather
    than starting again, so the whole curve costs one run instead of ten.
    """
    model = HistGradientBoostingClassifier(warm_start=True, **PARAMS)
    curve = []
    t0 = time.time()
    print(f"  {label}: trees   validate AP")
    for n in CHECKPOINTS:
        model.set_params(max_iter=n)
        model.fit(Xtr, Ytr)
        ap = float(
            average_precision_score(
                Yva, prior_shift(model.predict_proba(Xva)[:, 1], tr_rate, va_rate)
            )
        )
        curve.append({"trees": n, "validate_ap": ap})
        print(f"           {n:>5}   {ap:.5f}    ({time.time() - t0:.0f}s)")
    best = max(curve, key=lambda r: r["validate_ap"])
    print(f"           best {best['trees']} trees, AP {best['validate_ap']:.5f}")
    return model, curve, best


def main() -> None:
    d = np.load(FEATURES_NPZ, allow_pickle=True)
    X, Y, S = d["X"], d["Y"].astype(np.int8), d["S"]
    names = [str(n) for n in d["features"]]
    tr, va, te = S == 0, S == 1, S == 2

    Xtr, Ytr = X[tr], Y[tr]
    Xva, Yva = X[va], Y[va]
    Xte, Yte = X[te], Y[te]
    tr_rate = float(Ytr.mean())
    va_rate = float(Yva.mean())
    te_rate = float(Yte.mean())

    print(f"train {tr.sum():,} ({tr_rate:.1%} positive)")
    print(f"validate {va.sum():,} ({va_rate:.1%})   test {te.sum():,} ({te_rate:.2%})\n")

    # ── 1. how many trees does it want, judged on years it has not seen ──
    print("[1] growing on 2003-2013, scoring 2014-2017")
    probe, curve_all, best_all = grow(Xtr, Ytr, Xva, Yva, tr_rate, va_rate, "all 30")
    at_cap = next((r for r in curve_all if r["trees"] == 1500), None)
    if at_cap:
        print(f"           the old cap of 1500 was worth {at_cap['validate_ap']:.5f}"
              f" ({best_all['validate_ap'] - at_cap['validate_ap']:+.5f})\n")

    # ── 2. which features are making it worse, judged on the same years ──
    print("[2] permutation importance on 2014-2017")
    sub = np.random.default_rng(1).choice(
        np.arange(Xva.shape[0]), size=min(200_000, Xva.shape[0]), replace=False
    )
    Xs0, Ys = Xva[sub], Yva[sub]
    sub_rate = float(Ys.mean())
    base_ap = average_precision_score(
        Ys, prior_shift(probe.predict_proba(Xs0)[:, 1], tr_rate, sub_rate)
    )
    drops = []
    for i, name in enumerate(names):
        Xs = Xs0.copy()
        rng = np.random.default_rng(7 + i)
        Xs[:, i] = Xs[rng.permutation(Xs.shape[0]), i]
        ap = average_precision_score(
            Ys, prior_shift(probe.predict_proba(Xs)[:, 1], tr_rate, sub_rate)
        )
        drops.append((name, float(base_ap - ap)))
    drops.sort(key=lambda kv: kv[1])
    print("    lowest first:")
    for name, v in drops[:12]:
        print(f"      {v:+.5f}  {name}")

    dead = [n for n, v in drops if v <= 0]
    keep_names = [n for n in names if n not in dead]
    keep = [names.index(n) for n in keep_names]
    print(f"\n    dropping {len(dead)}: {', '.join(dead) or '(none)'}")
    print(f"    keeping {len(keep_names)}\n")

    del probe

    # ── 3. the same question again, without them ─────────────────────────
    if dead:
        print("[3] growing again on the pruned columns")
        _, curve_lean, best_lean = grow(
            Xtr[:, keep], Ytr, Xva[:, keep], Yva, tr_rate, va_rate, f"{len(keep)} feats"
        )
    else:
        curve_lean, best_lean, keep = curve_all, best_all, list(range(len(names)))
        keep_names = names

    lean_wins = best_lean["validate_ap"] >= best_all["validate_ap"]
    if not lean_wins:
        print(f"\n    pruning lost on validation "
              f"({best_lean['validate_ap']:.5f} < {best_all['validate_ap']:.5f}); keeping all 30")
        keep, keep_names, best_lean = list(range(len(names))), names, best_all

    trees = best_lean["trees"]
    print(f"\n    chosen: {len(keep_names)} features, {trees} trees\n")

    # ── 4. the model that ships: everything before the test years ────────
    print("[4] final fit on 2003-2017")
    Xfit = np.vstack([Xtr[:, keep], Xva[:, keep]])
    Yfit = np.concatenate([Ytr, Yva])
    fit_rate = float(Yfit.mean())
    t = time.time()
    model = HistGradientBoostingClassifier(**{**PARAMS, "max_iter": trees})
    model.fit(Xfit, Yfit)
    print(f"    {model.n_iter_} trees in {time.time() - t:.0f}s\n")

    # ── 5. the test years, once ──────────────────────────────────────────
    p_model = prior_shift(model.predict_proba(Xte[:, keep])[:, 1], fit_rate, te_rate)
    p_persist = Xte[:, names.index("own_7d")]
    p_clim = Xte[:, names.index("clim")]

    scores = {
        "model": {
            "average_precision": float(average_precision_score(Yte, p_model)),
            "roc_auc": float(roc_auc_score(Yte, p_model)),
            "brier": float(brier_score_loss(Yte, p_model)),
        },
        "persistence": {
            "average_precision": float(average_precision_score(Yte, p_persist)),
            "roc_auc": float(roc_auc_score(Yte, p_persist)),
        },
        "climatology": {
            "average_precision": float(average_precision_score(Yte, p_clim)),
            "roc_auc": float(roc_auc_score(Yte, p_clim)),
        },
        "always_no": {"average_precision": te_rate},
    }

    old = json.load(open(OLD_META, encoding="utf-8")) if os.path.exists(OLD_META) else None
    clim = scores["climatology"]["average_precision"]
    new_ap = scores["model"]["average_precision"]

    print("=" * 62)
    print("                    avg precision   roc auc    brier")
    if old:
        o = old["scores"]["model"]
        print(f"  v1 (shipped)        {o['average_precision']:.4f}          "
              f"{o['roc_auc']:.4f}     {o['brier']:.5f}")
    s = scores["model"]
    print(f"  v2 (this)           {s['average_precision']:.4f}          "
          f"{s['roc_auc']:.4f}     {s['brier']:.5f}")
    print(f"  climatology         {clim:.4f}          {scores['climatology']['roc_auc']:.4f}")
    print(f"  persistence         {scores['persistence']['average_precision']:.4f}")
    print(f"  base rate           {te_rate:.4f}")
    if old:
        o_ap = old["scores"]["model"]["average_precision"]
        print(f"\n  edge over climatology: v1 {o_ap - clim:+.4f}  ->  v2 {new_ap - clim:+.4f}")
        print(f"  change: {new_ap - o_ap:+.4f} AP "
              f"({100 * (new_ap - o_ap) / max(1e-9, o_ap - clim):+.0f}% of v1's edge)")
        print(f"\n  {'v2 WINS' if new_ap > o_ap else 'v2 does not win; keep v1'}")

    rel = reliability(p_model, Yte)
    print("\n  predicted      n        said    happened")
    for lo, hi, n, pm, ym in rel:
        print(f"  {lo:.2f}-{hi:.2f}  {n:>9,}   {pm:.3f}     {ym:.3f}")

    importance = [{"feature": n, "ap_drop": v} for n, v in sorted(drops, key=lambda kv: -kv[1])
                  if n in keep_names]

    with open(OUT_MODEL, "wb") as fh:
        pickle.dump(
            {"model": model, "features": keep_names, "trained_rate": fit_rate, "true_rate": te_rate},
            fh,
        )
    json.dump(
        {
            "horizon_days": HORIZON,
            "target": f"at least one MODIS detection in the cell over the next {HORIZON} days",
            "grid_degrees": 0.25,
            "population": "cells with at least one MODIS detection in 2003-2026",
            "splits": {k: f"{lo}-{hi}" for k, (lo, hi) in zip(("train", "validate", "test"), ERAS)},
            "test_base_rate": te_rate,
            "scores": scores,
            "reliability": [
                {"from": lo, "to": hi, "n": n, "predicted": pm, "observed": ym}
                for lo, hi, n, pm, ym in rel
            ],
            "importance": importance,
            "trees": int(model.n_iter_),
            "features": keep_names,
            "dropped": dead if lean_wins else [],
            "tree_curve": {"all": curve_all, "pruned": curve_lean},
            "builtAt": datetime.now(timezone.utc).isoformat(),
        },
        open(OUT_META, "w", encoding="utf-8"),
        indent=2,
    )
    print(f"\n{OUT_MODEL}\n{OUT_META}")


if __name__ == "__main__":
    main()
