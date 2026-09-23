/**
 * The one number on this site that could not have been arranged.
 *
 * Everything else the forecast page prints is measured on held-out test
 * years: years the model did not learn from, but years that were already
 * sitting in the archive when it was built. That is the right way to
 * measure and it is still a measurement taken indoors.
 *
 * This file is the other kind. The forecast was computed on the
 * nineteenth for the week after it, and nobody knew what that week would
 * do — not the model, not the archive, not the person who built either.
 * `scripts/verify_forecast.py` then asks NASA what has burned since and
 * writes down the answer. The question was asked before the answer
 * existed, which is the only arrangement that cannot be rigged.
 *
 * It is absent until that script has been run, and the page simply does
 * not show the band. A stale one would be worse than none: this is the
 * claim a reader is most likely to take on trust, so it has to carry the
 * date it was made on and how much of the week had passed.
 */

export interface VerifyRung {
  /** How many of the highest-ranked cells this rung covers. */
  top: number
  /** The share of them that burned. */
  burned: number
}

export interface VerifyBand {
  from: number
  to: number
  n: number
  said: number
  burned: number
  /** What the seven-day number implies for the days elapsed so far. */
  dueByNow: number
}

export interface Verify {
  from: string
  to: string
  /** Days of the window that have actually passed, out of seven. */
  elapsed: number
  whole: boolean
  flagged: number
  detections: number
  burnedCells: number
  caught: number
  missed: number
  /** The day the forecast was computed, which is what makes it one. */
  computed: string
  /** The day this check was run, which is what makes it fresh. */
  checked: string
  ranking: VerifyRung[]
  /**
   * The same ladder, for methods that cost nothing.
   *
   * Persistence is computed from the shipped daily tiles, so it is always
   * present; climatology needs the feature matrix the forecast was built
   * from and is absent whenever that has moved on.
   */
  baselines?: { persistence?: VerifyRung[]; climatology?: VerifyRung[] }
  bands: VerifyBand[]
}

/**
 * Every week that has ever been checked, oldest first.
 *
 * One prospective check is a claim; a row of them is a record. It is kept
 * in its own file because `verify.json` describes the week now on the
 * site and is overwritten whenever a new forecast is built — which is
 * precisely how the only unriggable measurement here used to be thrown
 * away once a week.
 */
export interface VerifyWeek {
  from: string
  to: string
  computed: string
  checked: string
  elapsed: number
  whole: boolean
  flagged: number
  burnedCells: number
  caught: number
  ranking: VerifyRung[]
  baselines?: { persistence?: VerifyRung[]; climatology?: VerifyRung[] }
}

let wanted: Promise<Verify | null> | null = null
let record: Promise<VerifyWeek[]> | null = null

export async function loadVerify(base = '/data'): Promise<Verify | null> {
  wanted ??= (async () => {
    const res = await fetch(`${base}/verify.json`)
    if (!res.ok) return null
    return (await res.json()) as Verify
  })().catch(() => null)
  return wanted
}

export async function loadVerifyRecord(base = '/data'): Promise<VerifyWeek[]> {
  record ??= (async () => {
    const res = await fetch(`${base}/verify-history.json`)
    if (!res.ok) return []
    const held = (await res.json()) as { weeks?: VerifyWeek[] }
    return Array.isArray(held.weeks) ? held.weeks : []
  })().catch(() => [])
  return record
}
