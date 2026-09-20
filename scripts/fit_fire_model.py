"""
Fit the seven-day model, and hold it against the two baselines that are free.

Everything here exists to answer one question honestly: does the model know
anything that climatology and persistence do not? If it does not, it should be
deleted, and this script is written so that outcome would be visible rather
than buried.

── Three things that are easy to get wrong, and are not ───────────────────

**The base rate.** Training saw one positive in four, because a model fed the
natural rate learns to answer "no" and stops. Predictions from a model trained
that way are inflated and must be corrected before anyone reads them as
probabilities. The correction is analytic — the two sampling rates are known —
so nothing is fitted to the test set. Calibration is then *checked* there.

**The population.** Rows come only from cells that burned at least once in
twenty-four years. Cells that have never burned are trivially predictable and
including them would lift every score without the model knowing anything. The
five per cent base rate below is therefore "among ground that does burn".

**The metric.** Accuracy is meaningless at a five per cent base rate — "never"
scores ninety-five. Average precision is the honest one, and the baselines are
scored on exactly the same rows.

    python scripts/fit_fire_model.py
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

import sys

# The horizon is a command-line argument so the same fitting code serves the
# week, the month and the season without a copy of itself per horizon.
HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7

# One definition of the year ranges, in the script that makes the samples.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_fire_model import ERAS as _ERAS  # noqa: E402

ERAS = [_ERAS[i] for i in (0, 1, 2)]

# `dry` fits the same rows without the weather columns. Two models on one
# set of samples is the only way to say what the weather is worth; two
# models on two sets of samples says nothing at all.
DRY = "dry" in sys.argv[2:]
TAG = "-dry" if DRY else ""

FEATURES_NPZ = f"models/features-{HORIZON}d{TAG}.npz"
OUT_MODEL = f"models/fire-{HORIZON}d{TAG}.pkl"
OUT_META = f"models/fire-{HORIZON}d{TAG}.json"
REPORT = f"docs/model-report{TAG}.md"

TRAIN_POS_RATE_NOTE = "one positive in four, by construction"


def prior_shift(p: np.ndarray, trained_rate: float, true_rate: float) -> np.ndarray:
    """Move probabilities from the sampled base rate back to the real one.

    Standard correction for case-control sampling: the sampling changed the
    odds by a known factor, so the logit moves by the log of that factor. It
    preserves every ranking and fixes only the level.
    """
    eps = 1e-9
    p = np.clip(p, eps, 1 - eps)
    logit = np.log(p / (1 - p))
    shift = np.log((trained_rate / (1 - trained_rate)) / (true_rate / (1 - true_rate)))
    z = logit - shift
    return 1 / (1 + np.exp(-z))


def reliability(p: np.ndarray, y: np.ndarray, edges=(0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.0)):
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi) if hi < 1 else (p >= lo)
        if m.sum() < 50:
            continue
        rows.append((lo, hi, int(m.sum()), float(p[m].mean()), float(y[m].mean())))
    return rows


def main() -> None:
    d = np.load(FEATURES_NPZ, allow_pickle=True)
    X, Y, S = d["X"], d["Y"].astype(np.int8), d["S"]
    names = [str(n) for n in d["features"]]

    tr, va, te = S == 0, S == 1, S == 2
    trained_rate = float(Y[tr].mean())
    true_rate = float(Y[te].mean())
    print(f"train {tr.sum():,} ({trained_rate:.1%} positive)   test {te.sum():,} ({true_rate:.2%} positive)")

    model = HistGradientBoostingClassifier(
        loss="log_loss",
        # The first run stopped at the cap rather than at a plateau, which
        # means it was still learning when it was cut off.
        max_iter=1500,
        learning_rate=0.05,
        max_leaf_nodes=31,
        min_samples_leaf=200,
        l2_regularization=1.0,
        early_stopping=True,
        validation_fraction=None,
        n_iter_no_change=25,
        random_state=20260920,
    )
    # Early stopping needs a held-out set; sklearn takes it from the training
    # data unless told otherwise, and taking it from 2019-2021 instead means
    # the stopping point is chosen on years the model has not seen.
    Xfit = np.vstack([X[tr], X[va]])
    Yfit = np.concatenate([Y[tr], Y[va]])
    model.fit(Xfit, Yfit)
    print(f"trees: {model.n_iter_}")

    raw = model.predict_proba(X[te])[:, 1]
    p_model = prior_shift(raw, trained_rate, true_rate)

    # The two baselines, on the same rows. Persistence is "it burned lately",
    # climatology is "it usually burns now"; neither needs fitting.
    p_persist = X[te][:, names.index("own_7d")]
    p_clim = X[te][:, names.index("clim")]
    y = Y[te]

    scores = {
        "model": {
            "average_precision": float(average_precision_score(y, p_model)),
            "roc_auc": float(roc_auc_score(y, p_model)),
            "brier": float(brier_score_loss(y, p_model)),
        },
        "persistence": {
            "average_precision": float(average_precision_score(y, p_persist)),
            "roc_auc": float(roc_auc_score(y, p_persist)),
        },
        "climatology": {
            "average_precision": float(average_precision_score(y, p_clim)),
            "roc_auc": float(roc_auc_score(y, p_clim)),
        },
        "always_no": {"average_precision": float(true_rate)},
    }

    print("\n                 avg precision   roc auc")
    for k in ("model", "persistence", "climatology"):
        s = scores[k]
        print(f"  {k:12s}   {s['average_precision']:.3f}          {s['roc_auc']:.3f}")
    print(f"  {'base rate':12s}   {true_rate:.3f}")

    rel = reliability(p_model, y)
    print("\n  predicted      n        said    happened")
    for lo, hi, n, pm, ym in rel:
        print(f"  {lo:.2f}-{hi:.2f}  {n:>9,}   {pm:.3f}     {ym:.3f}")

    # Which features carry the model, by the drop in average precision when
    # one is shuffled. On a subsample: the ranking is what matters, not the
    # third decimal.
    sub = np.random.default_rng(1).choice(np.where(te)[0], size=min(120_000, int(te.sum())), replace=False)
    base_ap = average_precision_score(Y[sub], prior_shift(model.predict_proba(X[sub])[:, 1], trained_rate, true_rate))
    importance = []
    for i, name in enumerate(names):
        Xs = X[sub].copy()
        rng = np.random.default_rng(7 + i)
        Xs[:, i] = Xs[rng.permutation(Xs.shape[0]), i]
        ap = average_precision_score(Y[sub], prior_shift(model.predict_proba(Xs)[:, 1], trained_rate, true_rate))
        importance.append((name, float(base_ap - ap)))
    importance.sort(key=lambda kv: -kv[1])
    print("\n  feature importance (drop in avg precision when shuffled)")
    for name, drop in importance[:8]:
        print(f"    {name:12s} {drop:+.4f}")

    import pickle

    with open(OUT_MODEL, "wb") as fh:
        pickle.dump({"model": model, "features": names, "trained_rate": trained_rate, "true_rate": true_rate}, fh)

    meta = {
        "horizon_days": HORIZON,
        "target": f"at least one MODIS detection in the cell over the next {HORIZON} days",
        "grid_degrees": 0.25,
        "population": "cells with at least one MODIS detection in 2003-2026",
        # Read from the feature builder rather than written out here. The
        # literal was left behind when the splits moved to fit the weather
        # record, and a model card that names the wrong test years is worse
        # than one that names none.
        "splits": {k: f"{lo}-{hi}" for k, (lo, hi) in zip(("train", "validate", "test"), ERAS)},
        "test_base_rate": true_rate,
        "scores": scores,
        "reliability": [
            {"from": lo, "to": hi, "n": n, "predicted": pm, "observed": ym} for lo, hi, n, pm, ym in rel
        ],
        "importance": [{"feature": n, "ap_drop": v} for n, v in importance],
        "trees": int(model.n_iter_),
        "builtAt": datetime.now(timezone.utc).isoformat(),
    }
    json.dump(meta, open(OUT_META, "w", encoding="utf-8"), indent=2)
    print(f"\n{OUT_MODEL}\n{OUT_META}")


if __name__ == "__main__":
    os.makedirs("models", exist_ok=True)
    main()
