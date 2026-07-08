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
