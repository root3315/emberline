"""
The week ahead, as a grid rather than fifteen thousand questions.

── Why this replaced the point API ────────────────────────────────────────

The first attempt asked Open-Meteo for each of the 15,290 one-degree squares
that have ever burned. It is a good service and it is free, and the free tier
is about five thousand points an hour and ten thousand a day — so a single
build of this file would have taken two days of polite waiting. That is not a
limit worth working around; it is a signal that the request is the wrong
shape.

NOAA publishes the GFS forecast as gridded files and lets anyone subset them
by variable and level. One request returns the whole planet at a quarter
degree for one moment, about five megabytes. Fifty-six of them cover seven
days at three-hourly steps, and nothing is rate limited. The same information
arrives in ten minutes instead of two days, because it is asked for the way
the archive stores it.

── Sub-daily, then daily ──────────────────────────────────────────────────

The features want a day's worth: how hot it got, how dry it got, how hard the
wind blew, how much fell. None of those can be read off a single instant, so
the steps are three-hourly and the day is reduced from its eight samples.

Rain is the exception and is read from the accumulation the file already
carries, differenced across the day boundary. The three-hourly buckets would
sum to the same thing when every step arrives, and to silently less when one
does not.

    python scripts/fetch_gfs.py [horizon]
"""

from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request
import warnings
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")

HORIZON = int(sys.argv[1]) if len(sys.argv) > 1 else 7
# The grid has to be the one the training half was read on, or the model
# learns from one field and is asked about another. ERA5 comes off the
# public mirror at a degree and a half, so that is what this matches; the
# GRIB files on disk are a quarter degree and are re-reduced, not refetched.
DEG_ARG = float(sys.argv[2]) if len(sys.argv) > 2 else 1.5
CELLS = "models/weather-cells.npz"
OUT = f"models/weather-forecast-{HORIZON}d.npz"
SCRATCH = Path("models/gfs")

WEATHER_DEG = DEG_ARG
STEP_HOURS = 3
FILTER = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
GFS_ROWS, GFS_COLS = 721, 1440  # 0.25 degrees, latitude 90 down to -90


def weather_points() -> dict:
    """
    Every weather square holding a fire cell that has ever burned.

    Built once and cached beside the grid it was built on, because walking
    the daily cube to find them reads a gigabyte off the disk and the answer
    only changes when the archive grows or the resolution moves.
    """
    cached = Path(CELLS)
    if cached.exists():
        with np.load(cached) as got:
            return {k: got[k] for k in got.files}

    import json

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from train_fire_model import load_tile

    idx = json.loads(Path("public/data/world/days-index.json").read_text(encoding="utf-8"))
    side, cols, deg = idx["tileCells"], idx["cols"], idx["degrees"]
    n_days = (date(2026, 9, 19) - date(2003, 1, 1)).days + 1
    wide = int(360 / WEATHER_DEG)

    keys: set[int] = set()
    for name, groups in sorted(idx["tiles"].items()):
        tx, ty = (int(v) for v in name.split("-"))
        grid = load_tile(tx, ty, groups, n_days, side)
        if grid is None:
            continue
        ever = np.where(grid.max(axis=1) > 0)[0]
        if ever.size:
            lat = -90 + ((ever // side) + ty * side + 0.5) * deg
            lon = -180 + ((ever % side) + tx * side + 0.5) * deg
            r = np.clip(((lat + 90) / WEATHER_DEG).astype(np.int32), 0, int(180 / WEATHER_DEG) - 1)
            c = np.clip(((lon + 180) / WEATHER_DEG).astype(np.int32), 0, wide - 1)
            keys.update((r * wide + c).tolist())
        del grid

    key = np.array(sorted(keys), dtype=np.uint32)
    lat = (-90 + (key // wide + 0.5) * WEATHER_DEG).astype(np.float32)
    lon = (-180 + (key % wide + 0.5) * WEATHER_DEG).astype(np.float32)
    out = {"key": key, "lat": lat, "lon": lon, "deg": np.float32(WEATHER_DEG)}
    np.savez_compressed(cached, **out)
    return out


def newest_cycle() -> tuple[datetime, str]:
    """
    The most recent run that has finished publishing.

    A cycle appears a few hours after its nominal time and fills in step by
    step, so the test is whether the last step we need is on the server, not
    whether the directory exists.
    """
    now = datetime.now(timezone.utc)
    for back in range(0, 8):
        when = now - timedelta(hours=6 * back)
        cycle = when.replace(hour=when.hour // 6 * 6, minute=0, second=0, microsecond=0)
        url = step_url(cycle, HORIZON * 24)
        try:
            request = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(request, timeout=60) as got:
                if got.status == 200:
                    return cycle, cycle.strftime("%Y%m%d %Hz")
        except urllib.error.HTTPError:
            continue
        except (urllib.error.URLError, TimeoutError):
            time.sleep(3)
    raise SystemExit("no complete GFS cycle found in the last two days")


def step_url(cycle: datetime, hour: int) -> str:
    return (
        f"{FILTER}?file=gfs.t{cycle:%H}z.pgrb2.0p25.f{hour:03d}"
        "&lev_2_m_above_ground=on&lev_10_m_above_ground=on&lev_surface=on"
        "&var_TMP=on&var_RH=on&var_UGRD=on&var_VGRD=on&var_APCP=on"
        f"&dir=%2Fgfs.{cycle:%Y%m%d}%2F{cycle:%H}%2Fatmos"
    )


def download(url: str, target: Path, tries: int = 5) -> Path:
    if target.exists() and target.stat().st_size > 100_000:
        return target
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=300) as got:
                target.write_bytes(got.read())
            return target
        except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError) as err:
            print(f"    {err}, retry {attempt + 1}")
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"could not fetch {url[:100]}")


def to_weather_grid(field: np.ndarray) -> np.ndarray:
    """
    A quarter-degree global field, averaged onto the one-degree weather grid.

    The archive counts latitude down from the pole and longitude up from
    Greenwich; the weather grid counts latitude up from the south pole and
    longitude from the date line. Both differences are undone here so that
    everything downstream can index by one rule.
    """
    field = field[::-1, :]  # latitude now runs south to north
    field = field[:-1, :]  # 721 rows is 180 whole degrees plus the pole itself
    rows, cols = int(180 / WEATHER_DEG), int(360 / WEATHER_DEG)
    per = int(WEATHER_DEG / 0.25)
    block = field.reshape(rows, per, cols, per).mean(axis=(1, 3))
    return np.roll(block, cols // 2, axis=1)  # Greenwich-first becomes date-line-first


def read_step(path: Path) -> dict[str, np.ndarray]:
    """The five fields of one moment, each on the weather grid."""
    from eccodes import codes_get, codes_get_values, codes_grib_new_from_file, codes_release

    out: dict[str, np.ndarray] = {}
    with open(path, "rb") as fh:
        while True:
            handle = codes_grib_new_from_file(fh)
            if handle is None:
                break
            try:
                short = codes_get(handle, "shortName")
                if short in ("2t", "2r", "10u", "10v") or (
                    short == "tp" and codes_get(handle, "startStep") == 0
                ):
                    values = codes_get_values(handle).reshape(GFS_ROWS, GFS_COLS)
                    # The cumulative bucket wins when both are present.
                    out[short] = to_weather_grid(np.asarray(values, dtype=np.float32))
            finally:
                codes_release(handle)
    return out


def main() -> None:
    # The cached points belong to whatever grid they were built on, so a
    # change of resolution has to throw them away rather than reuse them.
    cached = Path(CELLS)
    if cached.exists():
        with np.load(cached) as got:
            # Read the grid it was built on, then let the handle go: Windows
            # refuses to unlink a file numpy still has mapped.
            stale = abs(float(got["deg"]) if "deg" in got else 1.0) - WEATHER_DEG
        if abs(stale) > 1e-6:
            cached.unlink()

    cells = weather_points()
    key = cells["key"]
    cycle, label = newest_cycle()
    print(f"GFS cycle {label}, {HORIZON} days, {STEP_HOURS}-hourly")

    SCRATCH.mkdir(parents=True, exist_ok=True)
    rows, cols = int(180 / WEATHER_DEG), int(360 / WEATHER_DEG)
    flat = rows * cols

    tmax = np.full((HORIZON, flat), -np.inf, dtype=np.float32)
    rhmin = np.full((HORIZON, flat), np.inf, dtype=np.float32)
    wind = np.full((HORIZON, flat), -np.inf, dtype=np.float32)
    rain_at = np.zeros((HORIZON + 1, flat), dtype=np.float32)

    hours = list(range(STEP_HOURS, HORIZON * 24 + 1, STEP_HOURS))
    for n, hour in enumerate(hours, 1):
        path = download(step_url(cycle, hour), SCRATCH / f"f{hour:03d}.grb2")
        got = read_step(path)
        day = min((hour - 1) // 24, HORIZON - 1)

        if "2t" in got:
            tmax[day] = np.maximum(tmax[day], got["2t"].ravel() - 273.15)
        if "2r" in got:
            rhmin[day] = np.minimum(rhmin[day], got["2r"].ravel())
        if "10u" in got and "10v" in got:
            speed = np.hypot(got["10u"], got["10v"]).ravel() * 3.6  # m/s to km/h
            wind[day] = np.maximum(wind[day], speed)
        if "tp" in got and hour % 24 == 0:
            rain_at[hour // 24] = got["tp"].ravel()

        if n % 8 == 0 or n == len(hours):
            print(f"  +{hour:03d}h  {n}/{len(hours)}")
        time.sleep(0.5)

    precip = np.diff(rain_at, axis=0)
    precip[precip < 0] = 0.0  # a reset bucket reads as a negative difference

    day_zero = cycle.date() + timedelta(days=1)
    days = [str(day_zero + timedelta(days=d)) for d in range(HORIZON)]

    def take(block: np.ndarray) -> np.ndarray:
        picked = block[:, key].T.astype(np.float32)
        picked[~np.isfinite(picked)] = np.nan
        return picked

    np.savez_compressed(
        OUT,
        key=key,
        lat=cells["lat"],
        lon=cells["lon"],
        days=np.array(days),
        deg=np.float32(WEATHER_DEG),
        cycle=label,
        temperature_2m_max=take(tmax),
        relative_humidity_2m_min=take(rhmin),
        precipitation_sum=take(precip),
        wind_speed_10m_max=take(wind),
    )
    print(f"wrote {OUT}  {days[0]} to {days[-1]}  {key.size:,} points")


if __name__ == "__main__":
    main()
