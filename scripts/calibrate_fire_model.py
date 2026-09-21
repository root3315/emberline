"""
Make 85% mean 85%.

The model ranks well and states its confidence badly: it says 3.3% where
4.7% happens and 84% where 90% happens. Average precision measures
ranking and is blind to this — but every probability the site prints is
affected, and the page draws a calibration chart specifically so that a
reader can see whether to believe them.

── Why the analytic correction leaves something over ──────────────────

Training sees one positive in four because the quiet rows are
subsampled, so the fitted probabilities are inflated and `prior_shift`
moves them back by the log of a known odds ratio. That is exactly right
if the sampling changed nothing but the base rate. It evidently changed
a little more, and what is left over is what a fitted curve could take.

── The trap in fitting one ────────────────────────────────────────────

A calibration maps predicted to observed, so it has to be fitted where
"observed" means what it will mean in use. The validation rows are
case-control sampled — 26% of them burn against 5% in the world — so
fitting on them as they stand would calibrate to a population that does
not exist. The subsampling rate is recoverable from the two base rates,
so each surviving quiet row is weighted by the several it stands for,
and the weight is derived rather than typed, because the day somebody
changes the sampling is the day a typed constant starts lying.

The other trap is subtler and cost a run: the curve *replaces* the
analytic correction and must be fitted and applied on the raw output.
Stacking it on top of `prior_shift` is two corrections doing one job.

── Two candidates, because they fail differently ──────────────────────

Isotonic fits any monotone shape, which is the most a calibration can
do — with a staircase, so cells the model had ranked apart come out on
the same tread, and average precision pays for every tie.

Platt fits a line through the log-odds: two numbers, no ties, ranking
untouched by construction. It is also a strict generalisation of
`prior_shift`, which is that same line with its slope nailed to one.

Fitted on 2014-2017, measured once on 2018-2021, and kept only if it
improves the Brier score without costing the ranking.

    python scripts/calibrate_fire_model.py [horizon] [dry]
"""

from __future__ import annotations

import json
import os
import pickle
import sys

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7
DRY = "dry" in sys.argv[2:]
TAG = "-dry" if DRY else ""

FEATURES_NPZ = f"models/features-{HORIZON}d{TAG}.npz"
MODEL = f"models/fire-{HORIZON}d{TAG}.pkl"
META = f"models/fire-{HORIZON}d{TAG}.json"

EPS = 1e-9


def prior_shift(p: np.ndarray, trained_rate: float, true_rate: float) -> np.ndarray:
    p = np.clip(p, EPS, 1 - EPS)
    logit = np.log(p / (1 - p))
    shift = np.log((trained_rate / (1 - trained_rate)) / (true_rate / (1 - true_rate)))
    return 1 / (1 + np.exp(-(logit - shift)))


def logit(p: np.ndarray) -> np.ndarray:
    q = np.clip(p, EPS, 1 - EPS)
    return np.log(q / (1 - q))


def reliability(p, y, edges=(0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.0)):
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi) if hi < 1 else (p >= lo)
        if m.sum() < 50:
            continue
        rows.append((lo, hi, int(m.sum()), float(p[m].mean()), float(y[m].mean())))
    return rows


def show(name, rows):
    print(f"\n  {name}")
    print("    band          n      says   happens    gap")
    for lo, hi, n, said, hit in rows:
        print(f"    {lo:.2f}-{hi:.2f} {n:>9,}   {said:.3f}     {hit:.3f}   x{hit / max(said, EPS):.2f}")


def main() -> None:
    bundle = pickle.load(open(MODEL, "rb"))
    model, names = bundle["model"], bundle["features"]
    trained_rate = bundle["trained_rate"]

    d = np.load(FEATURES_NPZ, allow_pickle=True)
    X, Y, S = d["X"], d["Y"].astype(np.int8), d["S"]
    all_names = [str(n) for n in d["features"]]
    keep = [all_names.index(n) for n in names]

    va, te = S == 1, S == 2
    Xva, Yva = X[va][:, keep], Y[va]
    Xte, Yte = X[te][:, keep], Y[te]
    va_rate, te_rate = float(Yva.mean()), float(Yte.mean())
    print(f"validate {va.sum():,} ({va_rate:.1%} burn)   test {te.sum():,} ({te_rate:.2%} burn)")

    # With P positives kept whole and N negatives kept at rate r, the
    # sampled rate is P/(P+Nr) and the true rate P/(P+N); dividing one by
    # the other leaves r, and its reciprocal is how many real quiet rows
    # each kept one represents.
    rate = (1 / va_rate - 1) / (1 / te_rate - 1)
    print(f"each quiet validation row stands for {1 / rate:.2f} real ones")
    w = np.where(Yva == 1, 1.0, 1.0 / rate)

    raw_va = model.predict_proba(Xva)[:, 1]
    raw_te = model.predict_proba(Xte)[:, 1]
    p_te = prior_shift(raw_te, trained_rate, te_rate)

    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(raw_va, Yva, sample_weight=w)

    platt = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000)
    platt.fit(logit(raw_va).reshape(-1, 1), Yva, sample_weight=w)
    print(f"platt: slope {platt.coef_[0][0]:.3f}, intercept {platt.intercept_[0]:.3f}"
          "   (prior_shift is slope 1 with a fixed intercept)")

    runs = {
        "isotonic": np.clip(iso.predict(raw_te), 0.0, 1.0),
        "platt": platt.predict_proba(logit(raw_te).reshape(-1, 1))[:, 1],
    }

    def score(p):
        return {
            "average_precision": float(average_precision_score(Yte, p)),
            "roc_auc": float(roc_auc_score(Yte, p)),
            "brier": float(brier_score_loss(Yte, p)),
        }

    before = score(p_te)
    scored = {k: score(v) for k, v in runs.items()}

    show("as it ships (prior_shift)", reliability(p_te, Yte))
    for k, v in runs.items():
        show(k, reliability(v, Yte))

    print("\n" + "=" * 58)
    print("              brier      avg prec   roc auc")
    print(f"  ships     {before['brier']:.5f}    {before['average_precision']:.4f}"
          f"    {before['roc_auc']:.4f}")
    for k, sc in scored.items():
        print(f"  {k:<9} {sc['brier']:.5f}    {sc['average_precision']:.4f}"
              f"    {sc['roc_auc']:.4f}")

    # Brier decides, but not at the cost of the ranking the rest of the
    # site is built on: a calibration that reorders cells is not one.
    ok = {
        k: sc for k, sc in scored.items()
        if sc["brier"] < before["brier"]
        and sc["average_precision"] >= before["average_precision"] - 0.0005
    }
    if not ok:
        print("\n  neither curve earns its place; leaving the model alone")
        return

    pick = min(ok, key=lambda k: ok[k]["brier"])
    print(f"\n  keeping {pick}")

    bundle["calibrator"] = iso if pick == "isotonic" else platt
    bundle["calibrator_kind"] = pick
    with open(MODEL, "wb") as fh:
        pickle.dump(bundle, fh)

    meta = json.load(open(META, encoding="utf-8"))
    meta["scores"]["model"] = {**meta["scores"]["model"], **scored[pick]}
    meta["reliability"] = [
        {"from": lo, "to": hi, "n": n, "predicted": said, "observed": hit}
        for lo, hi, n, said, hit in reliability(runs[pick], Yte)
    ]
    meta["calibrated"] = pick
    json.dump(meta, open(META, "w", encoding="utf-8"), indent=2)
    print(f"  written into {MODEL} and {META}")
    print("  rebuild the forecast for it to reach the page")


if __name__ == "__main__":
    main()
