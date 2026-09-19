/**
 * The transition lab.
 *
 * A page whose only job is to let the candidate theme transitions be compared
 * against each other on something that looks like real content. It pulls in the
 * product's tokens and its view-transition rules — the stacking, the holding
 * animation, the burn layer — so a candidate behaves here exactly as it would
 * if it shipped.
 *
 * Nothing in the product imports this, and Vite only builds `index.html`, so
 * none of it reaches `dist`.
 */

import './styles/tokens.css'
import './styles/app.css'
import './styles/lab.css'
import { burnTransition } from './ui/burn'
import { runLabEffect, type LabEffect } from './ui/effects-lab'

const root = document.documentElement

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-effect]')) {
  button.addEventListener('click', () => {
    const kind = button.dataset.effect as LabEffect | 'burn'
    if (kind === 'burn') {
      // The one in production, for reference. It runs the other way — light to
      // dark — so it gets snapped to day first and then burned back down.
      if (root.dataset.theme !== 'day') root.dataset.theme = 'day'
      burnTransition(() => {
        root.dataset.theme = 'night'
      }, 'night')
      return
    }
    runLabEffect(kind)
  })
}
