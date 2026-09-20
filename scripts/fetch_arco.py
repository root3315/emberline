"""
Past weather, from the public ERA5 mirror, without a queue.

── Why not Copernicus ─────────────────────────────────────────────────────

The Climate Data Store is the official home of ERA5 and it was tried first.
It runs one of an account's requests at a time; a year at once is refused for
cost, six months and three sit in a queue that does not move, and a month
comes back — measured over a real run — in about six minutes. The record
this model wants is 1,152 of those. That is five days of waiting for four
gigabytes, which is a queue designed for a different kind of user.

ECMWF also publishes ERA5 as analysis-ready Zarr on Google Cloud, open to
anyone, no key and no queue. A chunk is six hundred kilobytes and arrives in
about a second, and they can be asked for in parallel. The same record takes
a quarter of an hour.

── What it costs ──────────────────────────────────────────────────────────

The mirror that is small enough to read whole ends at 2022, so the model's
years move: train 2003-2014, validate 2015-2018, test 2019-2022. The
weather-free model is re-scored on exactly those years too, or the comparison
would be between two different questions rather than two models.

── What a degree and a half cannot see ────────────────────────────────────

The mirror's grid is 1.5 degrees, which is about a hundred and sixty
kilometres, and terrain disappears inside that. The cell over the Fergana
valley reads seventeen degrees in July because it also holds four kilometres
of the Alay range; the valley floor is nearer thirty-five. Fire weather is
synoptic and mostly survives this, but a reader in a mountain valley should
know the model is being told about the mountain.

── What it gains ──────────────────────────────────────────────────────────

Daily rainfall is already summed, wind speed is already a speed, and the
static fields come along for nothing: land and sea, how much low and high
vegetation a cell carries, what kind it is. The model has never been told
what there is to burn — only where fire has been. Steppe, taiga and stubble
burn on different schedules for different reasons, and now it can know which
it is looking at.

    python scripts/fetch_arco.py [from] [to]
"""

from __future__ import annotations

import io
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import numcodecs

BASE = (
    "https://storage.googleapis.com/gcp-public-data-arco-era5/ar/"
    "1959-2022-6h-240x121_equiangular_with_poles_conservative.zarr"
)
OUT = Path("models/weather-history.npz")
STATIC_OUT = Path("models/weather-static.npz")
CELLS = "models/weather-cells.npz"

# Six-hourly since 1959-01-01 00:00.
ARCO_EPOCH = date(1959, 1, 1)
PER_DAY = 4
CHUNK_STEPS = 8

# What the day is reduced to, and how. Rain is already a daily total in the
# archive, so it is taken at one step a day rather than summed again.
MOVING = [
    ("tmax", "2m_temperature", "max"),
    ("wind", "10m_wind_speed", "max"),
    ("rain", "total_precipitation_24hr", "daily"),
]

# Fixed properties of the ground. One chunk each, and the model has never
# been told any of it.
STATIC = [
    "land_sea_mask",
    "low_vegetation_cover",
    "high_vegetation_cover",
    "type_of_low_vegetation",
    "type_of_high_vegetation",
]

WORKERS = 16
BATCH = 256
printing = threading.Lock()
_meta: dict | None = None


def meta() -> dict:
    global _meta
    if _meta is None:
        with urllib.request.urlopen(f"{BASE}/.zmetadata", timeout=120) as got:
            _meta = json.loads(got.read())["metadata"]
    return _meta


def chunk(variable: str, index: str) -> np.ndarray:
    """One chunk of one variable, decoded, with the archive's own retries."""
    spec = meta()[f"{variable}/.zarray"]
    codec = numcodecs.get_codec(spec["compressor"])
    url = f"{BASE}/{variable}/{index}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=180) as got:
                raw = got.read()
            return np.frombuffer(codec.decode(raw), dtype=spec["dtype"]).reshape(spec["chunks"])
        except urllib.error.HTTPError as err:
            if err.code == 404:
                # Zarr leaves a chunk out when it holds nothing but the fill
                # value, and here that value is NaN. Returning zeros instead
                # put absolute zero into the temperature record and dragged
                # every daily minimum down to -273.
                return np.full(spec["chunks"], np.nan, dtype=spec["dtype"])
            time.sleep(2 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not read {url}")


def step_of(day: date) -> int:
    return (day - ARCO_EPOCH).days * PER_DAY


def main() -> None:
    args = sys.argv[1:]
    lo = int(args[0]) if args else 2003
    hi = int(args[1]) if len(args) > 1 else 2022

    first, last = date(lo, 1, 1), date(hi, 12, 31)
    n_days = (last - first).days + 1
    step0, step1 = step_of(first), step_of(last) + PER_DAY
    c0, c1 = step0 // CHUNK_STEPS, (step1 + CHUNK_STEPS - 1) // CHUNK_STEPS
    chunks = list(range(c0, c1))

    spec = meta()["2m_temperature/.zarray"]
    _, n_lon, n_lat = spec["shape"]
    print(f"{lo}-{hi}: {n_days:,} days, {len(chunks):,} chunks per variable, grid {n_lon}x{n_lat}")

    wanted = sorted({source for _, source, _ in MOVING})
    out = {name: np.full((n_days, n_lon, n_lat), np.nan, dtype=np.float32) for name, _, _ in MOVING}

    def one(source: str, ci: int) -> tuple[str, int, np.ndarray]:
        return source, ci, chunk(source, f"{ci}.0.0")

    started = time.time()
    done = 0
    jobs = [(source, ci) for source in wanted for ci in chunks]

    #
    # Submitted in batches, and this is not a tidiness preference.
    #
    # Handing the whole list to the pool at once keeps a future object alive
    # for every job, and each finished future holds its decoded chunk — a
    # megabyte — until the loop reaches it. Eleven thousand of those is ten
    # gigabytes of results waiting to be looked at, on top of the three the
    # output arrays already need. The first run climbed past five gigabytes
    # with a gigabyte and a half of the machine left, which is the shape of
    # a swap death rather than a download.
    #
    def run_batch(batch: list[tuple[str, int]]):
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = [pool.submit(one, source, ci) for source, ci in batch]
            for future in as_completed(futures):
                yield future.result()

    for start in range(0, len(jobs), BATCH):
        for source, ci, block in run_batch(jobs[start : start + BATCH]):
            base_step = ci * CHUNK_STEPS
            for k in range(CHUNK_STEPS):
                step = base_step + k
                if not (step0 <= step < step1):
                    continue
                day = (step // PER_DAY) - (step0 // PER_DAY)
                field = block[k]
                for name, src, how in MOVING:
                    if src != source:
                        continue
                    if how == "max":
                        cur = out[name][day]
                        out[name][day] = np.where(np.isnan(cur), field, np.maximum(cur, field))
                    elif how == "min":
                        cur = out[name][day]
                        out[name][day] = np.where(np.isnan(cur), field, np.minimum(cur, field))
                    elif step % PER_DAY == 0:  # the 24h total, read once a day
                        out[name][day] = field
            done += 1
            if done % 500 == 0 or done == len(jobs):
                pace = (time.time() - started) / done
                with printing:
                    print(f"  {done:,}/{len(jobs):,}  ~{(len(jobs) - done) * pace / 60:,.0f} min left")

    # Kelvin and metres are the archive's units, not the model's.
    out["tmax"] -= 273.15
    out["wind"] *= 3.6  # m/s to km/h
    out["rain"] *= 1000.0  # metres of water to millimetres
    np.clip(out["rain"], 0, None, out=out["rain"])

    lat = np.asarray(chunk("latitude", "0"), dtype=np.float32)
    lon = np.asarray(chunk("longitude", "0"), dtype=np.float32)
    np.savez(
        OUT,
        lat=lat,
        lon=lon,
        first=str(first),
        last=str(last),
        **{k: v.astype(np.float32) for k, v in out.items()},
    )
    print(f"wrote {OUT}  {OUT.stat().st_size / 1e9:.2f} GB")

    fixed = {}
    for name in STATIC:
        try:
            fixed[name] = np.asarray(chunk(name, "0.0"), dtype=np.float32)
        except Exception as err:  # noqa: BLE001
            print(f"  {name}: not available ({str(err)[:60]})")
    if fixed:
        np.savez_compressed(STATIC_OUT, lat=lat, lon=lon, **fixed)
        print(f"wrote {STATIC_OUT}  {', '.join(fixed)}")


if __name__ == "__main__":
    main()
