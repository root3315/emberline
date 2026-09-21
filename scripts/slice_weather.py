"""
The shorter weeks, cut out of the long one.

The forecast page is getting a day-by-day view, which means a model per
horizon: one that answers "by tomorrow", one that answers "by Tuesday",
and so on to the seven-day model that already exists. Each of those wants
its own live weather file, because the four weather columns are summaries
*over the window being forecast* — the hottest day of it, everything that
falls across it, the hardest it blows, how many of its days stay dry.

Fetching GFS seven times would be seven times the download for
information already on disk: the one-day window is the first day of the
seven-day file, the three-day window is its first three days. A maximum
over a prefix, a sum over a prefix, a count over a prefix. So they are
cut rather than refetched.

The daily arrays in the seven-day file are the per-day values, not the
aggregates, which is what makes this possible at all.

    python scripts/slice_weather.py [longest]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

LONGEST = int(sys.argv[1]) if len(sys.argv) > 1 else 7
SOURCE = Path(f"models/weather-forecast-{LONGEST}d.npz")

# The order `weather_features.COLUMNS` fixed, and the reduction each one
# is: a prefix maximum, a prefix sum, a prefix maximum, a prefix count.
FIELDS = (
    "temperature_2m_max",
    "relative_humidity_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"{SOURCE} is missing; run scripts/fetch_gfs.py first")

    src = np.load(SOURCE, allow_pickle=True)
    days = [str(d) for d in src["days"]]
    print(f"{SOURCE}: {days[0]} to {days[-1]}, {src['key'].shape[0]:,} points")

    for horizon in range(1, LONGEST):
        out = Path(f"models/weather-forecast-{horizon}d.npz")
        np.savez_compressed(
            out,
            key=src["key"],
            lat=src["lat"],
            lon=src["lon"],
            # The window is the first `horizon` days of the long one, and the
            # labels have to say so or the forecast build will refuse to run
            # on a file it thinks is for another week.
            days=np.array(days[:horizon]),
            deg=src["deg"],
            cycle=src["cycle"],
            **{f: np.asarray(src[f])[:, :horizon] for f in FIELDS},
        )
        print(f"  {horizon}d -> {out.name}  {days[0]} to {days[horizon - 1]}")


if __name__ == "__main__":
    main()
