/**
 * The area chooser, once the list stopped being four regions.
 *
 * A native `<select>` was right while the list was short and every entry was
 * the same kind of thing. It is no longer either: the planet is in there
 * twice — as a quarter-century archive and as this week — and those need a
 * line of explanation each, which `<option>` cannot carry and which matters
 * more than the names do. Nor can you type at a `<select>`.
 *
 * The original element stays in the DOM, hidden. Everything else in the app
 * reads `els.aoi.value` and listens for its `change`, so keeping it as the
 * single source of truth means the URL router, the language switch and the
 * rest never learn that the control was replaced.
 */

export interface PickerEntry {
  value: string
  label: string
  /** The second line: what this actually is. */
  hint?: string
  /** Set apart from the places above it by a rule. */
  apart?: boolean
}

/**
 * Somewhere to ask when the fixed list has nothing.
 *
 * The chooser holds six entries; the planet holds everywhere else. Rather
 * than teach the picker about geography, it is handed a lookup and told to
 * append whatever comes back — debounced, because the search fires on every
 * keystroke and the service behind it is a free one with a rate limit.
 */
export type PickerLookup = (query: string, signal: AbortSignal) => Promise<PickerEntry[]>

/** What the empty line should say, when there is nothing to list. */
export type PickerState = 'empty' | 'searching' | 'failed'

interface Refs {
  root: HTMLElement
  button: HTMLElement
  current: HTMLElement
  pop: HTMLElement
  search: HTMLInputElement
  list: HTMLElement
  empty: HTMLElement
  select: HTMLSelectElement
}

export class Picker {
  private entries: PickerEntry[] = []
  private shown: PickerEntry[] = []
  private active = 0
  private open = false

  private lookup: PickerLookup | null = null
  private remote: PickerEntry[] = []
  private pending: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private query = ''
  /** The one searched place currently selected, if any. */
  private found: PickerEntry | null = null
  private optionEls: HTMLElement[] = []
  /** How the lookup is getting on, so the empty line can say something true. */
  private state: PickerState = 'empty'
  private say: (state: PickerState) => string = () => ''

  /** How to word each state; supplied by the page, which owns the language. */
  setPhrases(say: (state: PickerState) => string): void {
    this.say = say
  }

  setLookup(lookup: PickerLookup): void {
    this.lookup = lookup
  }

  constructor(private readonly r: Refs) {
    r.button.addEventListener('click', () => (this.open ? this.close() : this.show()))
    r.search.addEventListener('input', () => this.filter())
    r.search.addEventListener('keydown', (e) => this.onKey(e))
    r.button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.show()
      }
    })
    // Close on any click that is not ours, and on Escape from anywhere.
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !r.root.contains(e.target as Node)) this.close()
    })
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') {
        this.close()
        r.button.focus()
      }
    })
  }

  setEntries(entries: PickerEntry[]): void {
    this.entries = entries
    // Mirror into the hidden <select> so `value` and `change` stay meaningful.
    const keep = this.r.select.value
    this.r.select.innerHTML = ''
    for (const e of entries) {
      const opt = document.createElement('option')
      opt.value = e.value
      opt.textContent = e.label
      this.r.select.append(opt)
    }
    // The searched place survives a rebuild of the list.
    //
    // This runs on every language switch, and clearing the <select> took the
    // found place's <option> with it — leaving `select.value` silently back on
    // the first region while the button still read the place, and no `change`
    // to tell anyone. Clicking that first region afterwards then did nothing,
    // because `pick()` saw the value it was being asked for already set.
    if (this.found) this.r.select.append(this.foundOption(this.found))
    if (keep && this.optionFor(keep)) this.r.select.value = keep
    this.paintCurrent()
  }

  private optionFor(value: string): HTMLOptionElement | null {
    return [...this.r.select.options].find((o) => o.value === value) ?? null
  }

  private foundOption(entry: PickerEntry): HTMLOptionElement {
    this.r.select.querySelector('option[data-found]')?.remove()
    const opt = document.createElement('option')
    opt.value = entry.value
    opt.textContent = entry.label
    opt.dataset.found = '1'
    return opt
  }

  /**
   * Reflect a value chosen elsewhere — the URL on load, say.
   *
   * The visible control is the button, not the `<select>`, so anything that
   * sets the area without going through a click has to come here or the label
   * keeps reading whatever was chosen last. A value that is in no entry is a
   * searched place arriving from a link; it needs its own option and a caption,
   * since the list cannot supply one.
   */
  setValue(value: string, label?: string): void {
    if (this.entries.some((e) => e.value === value)) {
      this.found = null
      this.r.select.querySelector('option[data-found]')?.remove()
      this.r.select.value = value
    } else if (label) {
      const entry: PickerEntry = { value, label }
      this.r.select.append(this.foundOption(entry))
      this.found = entry
      this.r.select.value = value
    }
    this.paintCurrent()
  }

  private paintCurrent(): void {
    const on = this.entries.find((e) => e.value === this.r.select.value)
    this.r.current.textContent = on?.label ?? this.found?.label ?? ''
  }

  private show(): void {
    this.open = true
    this.state = 'empty'
    this.r.pop.hidden = false
    this.r.button.setAttribute('aria-expanded', 'true')
    this.r.search.value = ''
    this.filter()
    this.r.search.focus()
  }

  private close(): void {
    this.open = false
    this.r.pop.hidden = true
    this.r.button.setAttribute('aria-expanded', 'false')
  }

  /**
   * Match on any word, in any order, anywhere in the name or the hint.
   *
   * Not a prefix match: "бразилия" has to find "Серрадо, Мату-Гросу, Бразилия",
   * and somebody typing "мир сейчас" should land on the snapshot without
   * having to guess the order the words are written in.
   */
  private filter(): void {
    const raw = this.r.search.value.trim()
    const q = raw.toLowerCase()
    const words = q ? q.split(/\s+/) : []
    const local = this.entries.filter((e) => {
      if (!words.length) return true
      const hay = `${e.label} ${e.hint ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    if (raw !== this.query) {
      this.query = raw
      this.remote = []
      this.state = this.lookup && raw.length >= 2 ? 'searching' : 'empty'
      this.askRemote(raw)
    }
    this.shown = [...local, ...this.remote]
    this.active = Math.max(
      0,
      this.shown.findIndex((e) => e.value === this.r.select.value),
    )
    this.paintList()
  }

  /**
   * Ask the wider world, once the typing has paused.
   *
   * Cancelled on every new keystroke: without that, a slow answer to "узб"
   * can land after the answer to "узбекистан" and replace the right list with
   * a staler one.
   */
  private askRemote(query: string): void {
    if (this.timer) clearTimeout(this.timer)
    this.pending?.abort()
    if (!this.lookup || query.length < 2) return

    this.timer = setTimeout(() => {
      const ctrl = new AbortController()
      this.pending = ctrl
      void this.lookup?.(query, ctrl.signal)
        .then((found) => {
          if (ctrl.signal.aborted || this.query !== query) return
          this.remote = found
          this.state = 'empty'
          this.filterAgain()
        })
        .catch(() => {
          if (ctrl.signal.aborted || this.query !== query) return
          /**
           * Say the search broke, rather than that nothing matched.
           *
           * The geocoder is a free service with a rate limit and no promise of
           * being up. When it refused, the list fell back to "nothing found",
           * which is a claim about the world made out of a failure to ask —
           * and the one thing a reader cannot then do is try again, because
           * the page has told them there is nothing to find.
           */
          this.state = 'failed'
          this.filterAgain()
        })
    }, 320)
  }

  /** Repaint with whatever the lookup added, without re-asking for it. */
  private filterAgain(): void {
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean)
    const local = this.entries.filter((e) => {
      if (!words.length) return true
      const hay = `${e.label} ${e.hint ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    this.shown = [...local, ...this.remote]
    this.paintList()
  }

  /** Move the highlight without touching the elements themselves. */
  private setActive(i: number): void {
    this.active = i
    this.paintActive()
  }

  private paintActive(): void {
    this.optionEls.forEach((el, i) => {
      if (i === this.active) el.dataset.active = '1'
      else delete el.dataset.active
    })
    this.optionEls[this.active]?.scrollIntoView({ block: 'nearest' })
  }

  private paintList(): void {
    this.r.list.innerHTML = ''
    this.optionEls = []
    this.r.empty.hidden = this.shown.length > 0
    if (!this.r.empty.hidden) this.r.empty.textContent = this.say(this.state)

    this.shown.forEach((e, i) => {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'picker__opt' + (e.apart ? ' picker__opt--world' : '')
      btn.setAttribute('role', 'option')
      btn.setAttribute('aria-selected', String(e.value === this.r.select.value))
      if (i === this.active) btn.dataset.active = '1'

      const name = document.createElement('span')
      name.textContent = e.label
      btn.append(name)
      if (e.hint) {
        const hint = document.createElement('span')
        hint.className = 'picker__hint'
        hint.textContent = e.hint
        btn.append(hint)
      }

      btn.addEventListener('click', () => this.pick(e.value))
      /**
       * Hovering moves the highlight — it must not rebuild the list.
       *
       * A real click is pointerdown, pointerup and click on *the same*
       * element. Repainting on `pointerenter` threw that element away and put
       * a fresh one in its place, so the click had nothing to complete
       * against and the option simply would not select. Worse, it depended on
       * the smallest mouse movement, so it looked intermittent.
       *
       * Synthetic tests never saw it: calling `.click()` fires no pointer
       * events at all, so the list was never rebuilt underneath them.
       */
      btn.addEventListener('pointerenter', () => this.setActive(i))
      li.append(btn)
      this.r.list.append(li)
      this.optionEls.push(btn)
    })

    this.paintActive()
  }

  private pick(value: string): void {
    this.close()
    this.r.button.focus()
    if (this.r.select.value === value) return

    /**
     * A found place is not in the list, so give the `<select>` one.
     *
     * Everything downstream reads `els.aoi.value`, and assigning a value that
     * matches no `<option>` silently does nothing — the select stays on the
     * old region and the change never fires. So the chosen place is added as
     * an option first, replacing any previous one: the list is the six fixed
     * entries plus at most whichever place is currently open.
     */
    const found = this.shown.find((e) => e.value === value)
    if (found && !this.entries.some((e) => e.value === value)) {
      this.r.select.append(this.foundOption(found))
      this.found = found
    } else {
      this.found = null
      this.r.select.querySelector('option[data-found]')?.remove()
    }

    this.r.select.value = value
    this.paintCurrent()
    this.r.select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!this.shown.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      this.setActive((this.active + step + this.shown.length) % this.shown.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const pick = this.shown[this.active]
      if (pick) this.pick(pick.value)
    }
  }
}
