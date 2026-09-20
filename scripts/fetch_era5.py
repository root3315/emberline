"""
Past weather, from the Copernicus archive, on the grid the model reads.

The training half of the weather problem. Every row the model learns from is
a cell on a day, and this fetches what the sky was doing over that cell that
day: how hot it got, how dry, how much it rained, how hard it gusted.

── Daily, not hourly ──────────────────────────────────────────────────────

ERA5 is hourly, and hourly is twenty-four times more than a weekly fire model
can use. Copernicus publishes a post-processed daily product — the maximum,
the minimum, the sum, already taken — so the aggregation happens on their
side and what crosses the wire is what we would have kept anyway.

── One degree, and why the request says so ────────────────────────────────

The fire grid is a quarter degree, but fire weather is not. A front, a dry
spell, a heat wave: these are synoptic, hundreds of kilometres across, and
sampling them four times finer buys noise. At a quarter degree a year of one
variable is about a gigabyte and a half, and there are four variables and
twenty-four years — a hundred and forty gigabytes to answer a question about
weather systems. The request asks the server to regrid to one degree first,
which is the same information at a sixteenth of the size.

── One month per request, which was measured, not guessed ─────────────────

A year at once is refused outright: "cost limits exceeded". Six months and
three months are accepted and then sit in a queue that did not move in
sixteen minutes, while requests made after them finished. One month returns
in about a minute and weighs four megabytes. So a month is the unit, and
there are 24 x 12 x 4 of them, and Copernicus runs one at a time.

── The licence ────────────────────────────────────────────────────────────

Copernicus refuses everything until the account has accepted the product
licence, and the refusal reads like a server fault rather than a missing
signature. If that is what comes back, open the dataset page and press
Accept terms under Terms of use.

    python scripts/fetch_era5.py            # 2003-2026, every variable
    python scripts/fetch_era5.py 2015 2026  # a shorter record
"""

from __future__ import annotations

import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DATASET = "derived-era5-single-levels-daily-statistics"
RAW = Path("models/era5")
WEATHER_DEG = 1.0
# Copernicus runs one of this account's requests at a time and rejects the
# rest outright rather than queueing them, so a wide pool only burns retries.
# Two keeps one in flight and one waiting at the door.
WORKERS = 2

# (our name, the archive's name, which daily statistic).
#
# Humidity is not stored directly. The dewpoint at its lowest against the
# temperature at its highest is the driest moment of the day, which is the
# moment a fire cares about; the pair becomes a saturation deficit further
# down the pipeline, so the fields here stay raw.
#
# Wind is the gust rather than the mean. "10m_wind_speed" is ambiguous to the
# archive and refused; the mean of a day says little about whether a fire ran,
# and the strongest gust says a great deal.
WANT = [
    ("tmax", "2m_temperature", "daily_maximum"),
    ("dewmin", "2m_dewpoint_temperature", "daily_minimum"),
    ("precip", "total_precipitation", "daily_sum"),
    ("gust", "instantaneous_10m_wind_gust", "daily_maximum"),
]

printing = threading.Lock()


def client():
    """
    A client built from the project's own env file.

    The library would rather read ~/.cdsapirc, but this project already keeps
    its keys in one ignored place and there is no reason to scatter them into
    the home directory as well.
    """
    import cdsapi

    env = {}
    for line in Path(".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()

    if not env.get("CDS_KEY"):
        raise SystemExit("CDS_KEY is missing from .env")
    return cdsapi.Client(
        url=env.get("CDS_URL"),
        key=env["CDS_KEY"],
        quiet=True,
        progress=False,
        wait_until_complete=True,
    )


def fetch(cds, name: str, variable: str, stat: str, year: int, month: int) -> tuple[str, int]:
    """One variable, one month, already at one degree. Returns bytes written."""
    target = RAW / f"{name}-{year}-{month:02d}.nc"
    if target.exists() and target.stat().st_size > 10_000:
        return target.name, 0

    request = {
        "product_type": "reanalysis",
        "variable": [variable],
        "year": [str(year)],
        "month": [f"{month:02d}"],
        "day": [f"{d:02d}" for d in range(1, 32)],
        "daily_statistic": stat,
        "time_zone": "utc+00:00",
        "frequency": "1_hourly",
        "grid": [WEATHER_DEG, WEATHER_DEG],
        "data_format": "netcdf",
    }

    part = target.with_suffix(".part")
    for attempt in range(4):
        try:
            cds.retrieve(DATASET, request).download(str(part))
            part.replace(target)
            return target.name, target.stat().st_size
        except Exception as err:  # noqa: BLE001 - the library raises plain Exceptions
            text = str(err)
            if "licence" in text.lower() and "accept" in text.lower():
                raise SystemExit(
                    "Copernicus refused: the product licence has not been accepted.\n"
                    f"Open https://cds.climate.copernicus.eu/datasets/{DATASET}\n"
                    "and press Accept terms under Terms of use."
                ) from err
            if attempt == 3:
                with printing:
                    print(f"  {target.name}: gave up - {text.splitlines()[-1][:90]}")
                return target.name, -1
            time.sleep(20 * (attempt + 1))
    return target.name, -1


def main() -> None:
    args = sys.argv[1:]
    lo = int(args[0]) if args else 2003
    hi = int(args[1]) if len(args) > 1 else 2026

    RAW.mkdir(parents=True, exist_ok=True)
    # Newest first, on purpose.
    #
    # At three quarters of a minute per month this is most of a day, and a
    # run that is stopped half way should leave behind the half that is worth
    # more: the recent years are the ones the model is tested on, and a
    # shorter record starting later is a real fallback. A run stopped half
    # way through chronological order leaves nothing that can be trained on.
    jobs = [
        (name, variable, stat, year, month)
        for name, variable, stat in WANT
        for year in range(hi, lo - 1, -1)
        for month in range(1, 13)
    ]
    todo = [j for j in jobs if not (RAW / f"{j[0]}-{j[3]}-{j[4]:02d}.nc").exists()]
    print(f"{len(jobs):,} months, {len(jobs) - len(todo):,} already here, {len(todo):,} to fetch")
    if not todo:
        return

    cds = client()
    started = time.time()
    done = failed = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch, cds, *job): job for job in todo}
        for future in as_completed(futures):
            _, size = future.result()
            done += 1
            if size < 0:
                failed += 1
            if done % 20 == 0 or done == len(todo):
                pace = (time.time() - started) / done
                left = (len(todo) - done) * pace / 60
                with printing:
                    print(f"  {done:,}/{len(todo):,}  {pace:.1f}s each, ~{left:,.0f} min left")

    total = sum(p.stat().st_size for p in RAW.glob("*.nc"))
    print(f"done: {failed} failed, {total / 1e9:.1f} GB in {RAW}")


if __name__ == "__main__":
    main()
