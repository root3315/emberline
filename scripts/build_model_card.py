"""
Ship the model's own paperwork so the page can draw it.

── Why a file rather than prose ───────────────────────────────────────────

The about page describes a model, and a description of a model that
carries no numbers is an advertisement. Everything it claims — which
features matter, how much the weather is worth, whether the probabilities
mean what they say — exists as measurements in the training output, and
the only honest way to present them is to draw the measurements.

Copying them into the copy would have worked once. This reads them from
the two model cards each build, so retraining cannot leave the page
boasting about a model that no longer exists.

── Both models, because the comparison is the point ───────────────────────

`fire-7d.json` is the model with weather; `fire-7d-dry.json` is the same
rows, the same splits and the same seed without the weather columns. One
without the other says how good the model is; the pair says what the
weather bought, which is the question anyone sensible asks.

    python scripts/build_model_card.py [horizon]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7
WET = Path(f"models/fire-{HORIZON}d.json")
DRY = Path(f"models/fire-{HORIZON}d-dry.json")
OUT = Path("public/data/model.json")

# Friendly names, so the chart does not make a reader learn our variables.
# Anything not named here is dropped: the tail of a permutation importance
# is noise, and a chart of thirty bars where eighteen are indistinguishable
# from zero teaches nobody anything.
NAMES = {
    "clim": ("How often it burns at this time of year", "archive"),
    "cell_rate": ("How often this cell burns at all", "archive"),
    "ring_anom_30d": ("Neighbours burning above their normal", "archive"),
    "own_14d": ("Burned here in the last fortnight", "archive"),
    "ytd_anom": ("How this year is running so far", "archive"),
    "lat": ("Latitude", "archive"),
    "ring_3d": ("Neighbours burning in the last three days", "archive"),
    "own_7d": ("Burned here in the last week", "archive"),
    "ring_7d": ("Neighbours burning in the last week", "archive"),
    "own_3d": ("Burned here in the last three days", "archive"),
    "ring_1d": ("Neighbours burning yesterday", "archive"),
    "own_1d": ("Burned here yesterday", "archive"),
    "active_30d": ("Days with any fire in the last month", "archive"),
    "anom_30d": ("This cell burning above its normal", "archive"),
    "clim_ring": ("Whether the region is in season", "archive"),
    "since_last": ("Days since it last burned", "archive"),
    "lastyear_14d": ("The same fortnight a year ago", "archive"),
    "tile_anom_30d": ("The wider region above its normal", "archive"),
    "oni": ("El Nino", "archive"),
    "doy_sin": ("Time of year", "archive"),
    "doy_cos": ("Time of year", "archive"),
    "own_30d": ("Burned here in the last month", "archive"),
    "own_90d": ("Burned here in the last season", "archive"),
    "ring_30d": ("Neighbours burning in the last month", "archive"),
    "w_rain": ("Rain forecast for the week", "weather"),
    "w_tmax": ("How hot the week will get", "weather"),
    "w_dry": ("Dry days forecast in the week", "weather"),
    "w_wind": ("How hard the wind will blow", "weather"),
    "veg_low": ("Low vegetation: grass, crops", "ground"),
    "veg_high": ("High vegetation: forest", "ground"),
}


def main() -> None:
    wet = json.loads(WET.read_text(encoding="utf-8"))
    dry = json.loads(DRY.read_text(encoding="utf-8")) if DRY.exists() else None

    ranked = [f for f in wet.get("importance", []) if f["ap_drop"] > 0.0015]
    features = [
        {
            "name": NAMES.get(f["feature"], (f["feature"], "archive"))[0],
            "kind": NAMES.get(f["feature"], (f["feature"], "archive"))[1],
            "drop": round(f["ap_drop"], 4),
        }
        for f in ranked
    ]

    card = {
        "horizonDays": HORIZON,
        "features": len(wet.get("importance", [])),
        "trees": wet.get("trees"),
        "target": wet.get("target"),
        "population": wet.get("population"),
        "splits": wet["splits"],
        "grid": wet.get("grid_degrees"),
        "scores": {
            "model": round(wet["scores"]["model"]["average_precision"], 4),
            "rocAuc": round(wet["scores"]["model"]["roc_auc"], 4),
            "climatology": round(wet["scores"]["climatology"]["average_precision"], 4),
            "persistence": round(wet["scores"]["persistence"]["average_precision"], 4),
            "baseRate": round(wet["test_base_rate"], 4),
        },
        "importance": features,
        "reliability": [
            {
                "said": round(b["predicted"], 4),
                "burned": round(b["observed"], 4),
                "n": b["n"],
            }
            for b in wet.get("reliability", [])
        ],
    }

    if dry:
        card["without"] = {
            "model": round(dry["scores"]["model"]["average_precision"], 4),
            "rocAuc": round(dry["scores"]["model"]["roc_auc"], 4),
        }
        base = dry["scores"]["climatology"]["average_precision"]
        card["edge"] = {
            "without": round(dry["scores"]["model"]["average_precision"] / base - 1, 4),
            "with": round(wet["scores"]["model"]["average_precision"] / base - 1, 4),
        }

    OUT.write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    kept = len(features)
    print(f"wrote {OUT}  {kept} of {card['features']} features worth drawing")
    print(f"  edge over the season: {card['edge']['without']:+.1%} -> {card['edge']['with']:+.1%}")


if __name__ == "__main__":
    main()
