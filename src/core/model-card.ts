/**
 * The model's own paperwork, for the page that describes it.
 *
 * Written at build time from the two model cards — the one trained with
 * weather and the one trained without — so the page cannot outlive the
 * model it is talking about. Three kilobytes.
 */

export interface Weight {
  name: string
  kind: string
  drop: number
}

export interface ModelCard {
  horizonDays: number
  features: number
  trees: number
  target: string
  splits: { train: string; validate: string; test: string }
  scores: {
    model: number
    rocAuc: number
    climatology: number
    persistence: number
    baseRate: number
  }
  importance: Weight[]
  reliability: Array<{ said: number; burned: number; n: number }>
  /** Absent if the weather-free twin was never trained. */
  without?: { model: number; rocAuc: number }
  edge?: { without: number; with: number }
}

let card: ModelCard | null = null
let wanted: Promise<ModelCard | null> | null = null

export async function loadModelCard(base = '/data'): Promise<ModelCard | null> {
  if (card) return card
  wanted ??= (async () => {
    const res = await fetch(`${base}/model.json`)
    if (!res.ok) return null
    card = (await res.json()) as ModelCard
    return card
  })().catch(() => null)
  return wanted
}
