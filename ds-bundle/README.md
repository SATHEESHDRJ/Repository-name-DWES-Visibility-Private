# DWES Design System — build guidance

DWES is a tablet-optimized wiring-execution app. These are its real, shipped React
primitives — build with them directly, style via their props and the classes below,
and never re-implement them.

## Wrapping & setup (required)

Wrap the app root in **`ThemeProvider`** — it sets `data-theme="arctic"` and
`data-mode` (light/dark) on `<html>`. Without it, components render with base
tokens only (washed-out / unthemed). It also supplies the context `ThemeToggle`
reads.

```jsx
<ThemeProvider>
  <YourScreen />
</ThemeProvider>
```

Shell/navigation components (**`DashboardShell`** and anything rendering the topbar)
additionally need a router in scope — wrap in a react-router `MemoryRouter` or
`BrowserRouter` — and a signed-in user, which they read from `useAuthStore`.

## Styling idiom — two real layers

1. **Tailwind v4 utilities** for your own layout glue: `flex`, `grid`, `gap-4`,
   `w-full`, `p-4`, `text-sm`, `min-w-0`, etc. The `@theme` tokens back these.
2. **Design-system component classes** when composing raw markup (the exported
   components already apply them):

| Family | Real class names |
|---|---|
| Buttons | `btn-primary`, `btn-primary-lg`, `btn-secondary`, `btn-success`, `btn-danger`, `btn-warning`, `btn-ghost`, `btn-sm`, `btn-icon` |
| Badges | `badge` + one of `badge-green` / `badge-blue` / `badge-amber` / `badge-orange` / `badge-gray` |
| Cards | `card`, `card-header`, `card-title`, `card-body` |
| Forms | `form-group`, `form-label`, `form-input`, `form-select`, `form-textarea`, `form-error` |
| KPIs | `kpi-card` with `data-variant="green|blue|amber|red"` |
| Empty state | `empty-state`, `empty-state-title`, `empty-state-description` |

Theme colors are CSS custom properties: `--color-*` and the `--t-*` theme tokens
(e.g. `--t-on-header`); sizing uses `--text-*`, `--spacing`, `--radius-*`,
`--font-family-sans`. Prefer a semantic component over raw classes whenever one
exists (`<Badge label="active" />`, not hand-written `badge badge-green`).

Prefer the exported components and drive appearance through their props:
`<Button variant>`, `<Card>/<CardHeader>/<CardTitle>/<CardBody>`,
`<Input label error>`, `<FormGroup>/<FormLabel>/<FormInput>/<FormSelect>`,
`<DataTable columns rows rowKey>`, `<KpiCard label value variant icon>`,
`<Badge label>`, `<EmptyState title description icon action>`,
`<SectionHeader title description actions>`, `<Icon name>` (Material Symbols
ligature names, e.g. `cable`, `done_all`), `<Modal>`, `<Skeleton>`.

## Where the truth lives

- `styles.css` (imports the compiled `_ds_bundle.css` + tokens/fonts) — the full
  class + token vocabulary.
- Per component: `components/general/<Name>/<Name>.d.ts` (prop contract) and
  `<Name>.prompt.md` (usage).

## Example

```jsx
<ThemeProvider>
  <div className="flex flex-col gap-4 p-4">
    <SectionHeader
      title="Cable Schedule"
      description="ENOWA-01 · Main Panel A12"
      actions={<Button variant="primary">New session</Button>}
    />
    <div className="flex gap-4">
      <KpiCard label="Frames complete" value="18 / 24" variant="green" icon={<Icon name="done_all" />} />
      <KpiCard label="Cables wired" value="1,204" variant="blue" icon={<Icon name="cable" />} />
    </div>
    <Card>
      <CardHeader><CardTitle>Frame A12 — Main Panel</CardTitle></CardHeader>
      <CardBody>142 cables · 87% wired <Badge label="in_progress" /></CardBody>
    </Card>
  </div>
</ThemeProvider>
```

# DWES (dwes@0.0.0)

This design system is the published dwes React library, bundled as a single
browser global. All 31 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.DWES`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.DWES.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { Badge } = window.DWES;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<Badge />);
```

Wrap the tree in the provider — most components read theme/i18n from context:

```jsx
<ThemeProvider><MemoryRouter>{children}</MemoryRouter></ThemeProvider>
```

## Tokens

524 CSS custom properties from dwes. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (209): `--tw-border-style`, `--tw-shadow-color`, `--tw-inset-shadow-color`, …
- **spacing** (18): `--tw-space-y-reverse`, `--tw-inset-shadow`, `--tw-inset-shadow-alpha`, …
- **typography** (23): `--tw-tracking`, `--tw-font-weight`, `--font-sans`, …
- **radius** (9): `--radius-sm`, `--radius-md`, `--radius-lg`, …
- **shadow** (30): `--tw-shadow`, `--tw-shadow-alpha`, `--tw-ring-shadow`, …
- **other** (235): `--tw-translate-x`, `--tw-translate-y`, `--tw-translate-z`, …

## Components

### general
- `Badge`
- `Button`
- `ButtonHintPopover`
- `CableSchematic`
- `Card`
- `ComboField`
- `CompanyLogo`
- `CompletionReport`
- `DashboardShell`
- `DataTable`
- `EmptyState`
- `FormError`
- `FormGroup`
- `FormInput`
- `FormLabel`
- `FormSelect`
- `FormTextarea`
- `Icon`
- `Input`
- `InputField`
- `KpiCard`
- `Modal`
- `OverflowActionMenu`
- `ProjectInfoCard`
- `ReportPreviewModal`
- `SectionHeader`
- `SelectField`
- `Skeleton`
- `ThemeToggle`
- `Toast`
- `VerificationModal`
