# Data Plate — the design system

The visual system for Smart Rental Tracking. Two files hold it:

| File | Holds | Consumed by |
|---|---|---|
| [`app/globals.css`](app/globals.css) | the `@theme` block — every colour, type step, radius and shadow | Tailwind classes |
| [`lib/design-system.ts`](lib/design-system.ts) | the same values as literals, plus chart geometry and formatters | Recharts, Leaflet, inline styles |

They are duplicated on purpose — the same tradeoff the team already took for
`lib/types.ts` vs the backend contracts. **Change a colour in both.**

---

## The idea

Every machine in a yard carries a stamped identification plate: condensed caps,
tight label/value pairs, mono serials. That plate is the signature element, and
the palette is workwear — graphite, steel, concrete dust, one hi-vis orange.

Three rules the whole system rests on:

1. **Accent discipline.** Hi-vis orange means *you can act on this*. It is never
   decorative and never a data series.
2. **One colour, one meaning.** Machine state draws from the status ramp. A hue
   never does double duty.
3. **UI colour ≠ chart colour.** The workwear palette is deliberately
   desaturated — right for chrome, wrong for data marks that must be told
   apart. Charts draw from their own validated ramp.

The app is **light-only by design** (a yard tablet in daylight), so there is one
committed palette rather than a light/dark pair.

---

## Colour

### Surface & ink
| Token | Hex | Use |
|---|---|---|
| `ink` | `#16181a` | primary text, dark chrome |
| `steel` | `#3d4550` | secondary text |
| `mute` | `#6c7480` | tertiary text, axis labels |
| `line` | `#d3cfc7` | hairline borders |
| `dust` | `#edebe6` | page plane |
| `plate` | `#ffffff` | card surface |

### Accent — actionable only
`hivis` `#ff6b1a` · `hivis-deep` `#d8500a`

### Status ramp — one colour, one meaning
`ok` `#1f7a5c` · `warn` `#b8860b` · `alert` `#c1272d` · `busy` `#2b5f8a`

Used by `StatusPill` for equipment, booking and severity states. Status colours
always ship with a text label — never colour alone.

### Chart ramp
Re-stepped from the status hues so adjacent marks separate. **Validated**, not
eyeballed, against the `#ffffff` plate surface:

| Token | Hex | Use |
|---|---|---|
| `chart-1` | `#1f6fb2` | primary series — engine hours, fuel, temperature, forecast |
| `chart-2` | `#0f8a55` | working hours |
| `chart-3` | `#c28a00` | idle hours |
| `chart-mute` | `#9aa0a8` | de-emphasis — moving averages, OFF state, retired |
| `chart-limit` | `#c1272d` | threshold rules, critical marks |

Measured separation (ΔE, OKLab ×100):

```
chart-1 ↔ chart-limit    29.6 normal · 20.9 CVD   temp series vs its 105°C rule
chart-2 ↔ chart-3        20.2 normal ·  8.2 CVD   working vs idle
chart-1 ↔ chart-mute     20.9 normal · 17.8 CVD   series vs its moving average
```

`chart-mute` reads grey on purpose — it is the emphasis form's recessive
channel, not an identity slot.

**Why the temperature series is blue.** Any warm hue sits ~ΔE 6 from the alert
red, below the legibility floor. The thing that must read as danger is the
threshold rule; the crossing is the signal, not the hue of the line.

---

## Typography

Four registers, named by **role, not size**, so the class says what the text
*is*. Tracking is baked into each step — small stamps need more of it than
large ones, and that is not a per-usage decision.

| Register | Steps | Font | Use |
|---|---|---|---|
| **stamp** | `stamp-xs` 9 · `stamp-sm` 10 · `stamp` 11 · `stamp-lg` 12 | display, uppercase | labels, plate headers, nav, pills, buttons |
| **data** | `data-xs` 11 · `data-sm` 12 · `data` 14 · `data-lg` 18 · `data-xl` 24 · `data-2xl` 32 | mono | machine numbers, codes, KPI values |
| **prose** | `note` 13 · `body` 15 | sans | hints, errors, captions, body copy |
| **display** | `title-sm` 24 · `title` 32 · `title-lg` 44 | condensed | headings, page titles |

Pair a stamp step with the `.stamp` class, which supplies family, uppercase and
weight. `.stamp` lives in `@layer components` so any `text-stamp-*` utility wins
over its default tracking.

**There are no `text-sm` / `text-xs` / arbitrary `text-[11px]` in this codebase.**
A size with no role is a size that drifts.

---

## Geometry

`radius-plate` 2px · `radius-plate-lg` 4px
`shadow-plate` (hairline lift) · `shadow-raised` (tooltips, popovers)

---

## Components

| Component | Role |
|---|---|
| `ui/Plate`, `PlateRow`, `PlateRows` | the signature card — dark header strip, stamped label/value rows |
| `ui/StatusPill` | equipment / booking / severity state |
| `ui/Button`, `ui/Field` | actions and form inputs |
| `charts/ChartFrame` | the frame every chart sits in — one frame is what makes five charts read as one system |
| `charts/ChartLegend`, `LegendKey` | identity is never colour alone |
| `charts/ChartTooltip`, `ChartEmpty` | shared hover layer and empty state |

### Chart rules
- **One axis.** Never a second y-scale.
- **Legend for ≥2 series**, none for one — the title names it.
- **Recessive grid**: horizontal rules only, `line` at 3-3 dash.
- **`ChartFrame` carries the height.** `ResponsiveContainer` measures its
  parent, so the parent needs a real one.
- **Bucket server-side.** 21 days × 144 ticks does not get downsampled in React.

### Forms this system deliberately avoids
- **No donuts.** The fleet status mix is a horizontal part-to-whole bar
  (`charts/StatusBar`) with every segment direct-labelled. Long category names
  ("CHECKED OUT") need horizontal room, and a donut asks the reader to compare
  arcs by colour alone.
- **No one-bar bar charts.** Headline numbers are stat tiles.

---

## Checking a change

Chart colours are computable, so compute them. The palette validator used to
step this ramp lives in the `dataviz` skill:

```bash
node scripts/validate_palette.js "#1f6fb2,#0f8a55,#c28a00" --mode light --surface "#ffffff"
```

Adjacent pairs must clear ΔE 15 for normal vision and ΔE 8 under CVD.
