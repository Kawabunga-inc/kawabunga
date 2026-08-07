# Kawabunga Theme Tokens

`themes/ocean.css` is the source of truth for runtime theme variables, and the
only palette that ships. Use the canonical tokens below — the compatibility
alias tier has been removed, so there is no longer a gradual-migration path to
fall back on.

## Design source

The palette originates in the **Kawabunga Brand & Design System** Paper file,
page *voices*:

- **Dark** — the "voice card — explorations" artboard, which is drawn entirely
  from `var(--color-*)` references. It renders the `:root` contract directly,
  so `:root` and dark mode are by definition the same palette.
- **Light** — the "voice card — light mode" artboard: `#F5F6F4` ground,
  `#FFFFFF` cards on a `0 10px 30px rgba(0,0,0,.06)` shadow, `#5E8E84` accent
  (the mint drops to a deeper teal so it survives on white), and a
  `.88 / .68 / .42 / .18` black text ramp.

When a value changes in Paper, change it here — not in a component.

Nothing downstream of `ocean.css` may redeclare a semantic token. A component
that needs a different value changes it here, or composes one with `color-mix`
from an existing token. `npm run theme:check` enforces the removed aliases.

## Canonical Color Tokens

Surfaces:
- `--background`
- `--sidebar`
- `--surface-1`
- `--surface-2`
- `--surface-hover`
- `--surface-active`
- `--canvas-surface`

Text:
- `--foreground`
- `--text-primary`
- `--text-secondary`
- `--text-tertiary`
- `--text-quaternary`
- `--text-placeholder`

Lines and controls:
- `--border-subtle`
- `--border-medium`
- `--border-active`
- `--border`
- `--control-bg`
- `--control-border`
- `--popover-bg`
- `--popover-border`

Brand and status:
- `--accent`
- `--accent-strong`
- `--accent-secondary`
- `--accent-on`
- `--status-live`
- `--status-draft`
- `--status-archived`
- `--status-error`
- `--status-processing`
- `--status-info`

Supporting semantic hues:
- `--emissive-mint`
- `--signal-blue`
- `--event-violet`
- `--warning-amber`
- `--critical-crimson`

Derived fills:
- `--ink-wash`, `--ink-soft`, `--ink-fill`, `--ink-line`, `--ink-edge`
- `--accent-wash`, `--accent-fill`, `--accent-border`, `--accent-glow`, `--accent-soft`
- `--critical-wash`, `--critical-fill`, `--critical-border`

Materials and effects:
- `--material-surface`
- `--material-card`
- `--canvas-atmosphere`
- `--page-atmosphere`
- `--shadow`
- `--elevation-surface`
- `--elevation-card`
- `--elevation-panel`
- `--elevation-modal`
- `--elevation-menu`
- `--elevation-side`

## Removed Aliases

These no longer exist. `theme:check` fails the build if one reappears.

| Removed | Use instead |
|---|---|
| `--app-background` | `--background` |
| `--node-canvas` | `--canvas-surface` |
| `--divider` | `--border-subtle` |
| `--panel` | `--surface-1` |
| `--panel-strong` | `--surface-active` |
| `--card` | `--material-surface` |
| `--card-hover` | `--surface-hover` |
| `--card-border` | `--border-subtle` |
| `--input-bg` | `--control-bg` |
| `--input-border` | `--control-border` |
| `--dropdown-bg` | `--popover-bg` |
| `--dropdown-border` | `--popover-border` |
| `--surface-material` | `--material-surface` |
| `--card-material` | `--material-card` |
| `--canvas-background` | `--canvas-atmosphere` |
| `--app-atmosphere` | `--page-atmosphere` |
| `--muted` | `--text-tertiary` |
| `--dim` | `--text-quaternary` |
| `--passive-teal` | `--accent` |
| `--active-teal` | `--accent-strong` |
| `--neural_color` | `--accent` |
| `--success` | `--status-live` |
| `--danger` | `--status-error` |
| `--forest-*` | semantic surface/accent tokens |

Their Tailwind mappings went with them, so `bg-card`, `text-muted`,
`bg-panel`, and `bg-forest-*` are gone too. Use `bg-surface-1`,
`text-text-tertiary`, and friends.

## Usage Guidance

- Prefer semantic tokens over raw hex values in app components.
- Use `--surface-1` for ordinary panels and `--surface-2` for raised stages or
  canvases.
- Use `--surface-hover` and `--surface-active` for interactive states.
- Use `--control-bg` / `--control-border` for fields and low-emphasis controls.
- Use `--popover-bg` / `--popover-border` for menus, dropdowns, and floating
  pickers.
- Use `--material-surface` for broad panels and `--material-card` for repeated
  item cards.
- Choose a semantic surface or material token directly; there is no longer a
  generic card alias to fall back on.
- Use `--text-tertiary` for muted labels.
- Use `--status-error` for validation/errors and `--critical-crimson` only for
  stronger destructive or graph-category red.
## Theme Modes

**Ocean is the only palette.** The variant axis is retired — the `clean`,
`river`, and five `mono-*` families are deleted, not dormant. `ocean.css` has
one palette with three mode overrides, so a token has exactly one definition
per mode and you can read its value off the file.

`data-theme` selects the mode:

- `dark` — the admin default, and what `apps/admin` renders. It declares **no
  colour of its own**: `:root` already holds the Paper dark contract, so the
  block carries only chrome (glass, elevation, scrims). Redeclaring a palette
  token here is what let dark drift to a `#05070A` ground against Paper's
  `#13181D`; put the value in `:root` instead.
- `light` — follows the user's `odyssey-theme` preference. Matches the Paper
  light artboard value for value.
- `deep` — near-black cinematic mode, and the *only* place the `#05070A`
  ground now lives. `apps/web` scene and visit pages mount `<DeepTheme />` to
  opt in. This is a deliberate third ground, not a darker dark.
- `system` — resolves to dark or light from `prefers-color-scheme`.

`apps/admin` pins `data-theme-variant="ocean"` in `app/layout.tsx` (the inline
pre-hydration script) and re-asserts it in `admin-shell.tsx`; `apps/web` sets
no variant. Both land on the same `:root` palette either way — the attribute is
now belt-and-braces rather than a selector anything keys off.

### The shell is not a theme layer

`.odyssey-shell` in `apps/admin/src/app/globals.css` defines *material* only —
blur, elevation, hairline highlights. It once carried a full teal palette that
shadowed this file on every authenticated screen, which made Ocean impossible
to tune from one place. Don't reintroduce that: colour belongs in `ocean.css`.
