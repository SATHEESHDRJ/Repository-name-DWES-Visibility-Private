# DWES design-sync notes

## What this syncs
DWES is a **React app, not a published component library** — there is no `dist/`
with a named-export entry or a `.d.ts` tree. The sync scopes the **reusable UI
primitives** in `src/components/ui/` (+ top-level `Modal`, `Badge`), 31 components
total (see `config.json` `componentSrcMap`).

## Key mechanics (repo-specific)
- **Custom entry barrel** `.design-sync/entry.tsx` — most primitives are
  `export default`, which `export * from` will NOT surface on `window.DWES`. The
  barrel does explicit `export { default as X }` for those and `export *` for the
  named-export files. Pass `--entry .design-sync/entry.tsx` to the converter.
- **`Form.tsx` and `TabletFields.tsx` have no eponymous export** — they are groups.
  `Form.tsx` → FormGroup/FormLabel/FormInput/FormSelect/FormTextarea/FormError;
  `TabletFields.tsx` → InputField/ComboField/SelectField. Each is mapped as its own
  component (all pointing at the same source file for enrichment).
- **Theming is attribute-scoped.** `src/styles/themes.css` puts the active palette
  under `[data-theme="arctic"]` and base themed rules under `[data-theme]`. Without
  a `data-theme` ancestor, components render with base tokens only. `cfg.provider`
  is the app's own `ThemeProvider` (`src/components/layout/ThemeProvider.tsx`),
  which sets `data-theme="arctic"` + `data-mode` on `<html>` and supplies the
  `useTheme()` context `ThemeToggle` needs.
- **Styling is Tailwind v4** (`@import "tailwindcss"` + `@theme` in `src/index.css`).
  The design system CSS is *compiled*, not static. `cfg.cssEntry` points at
  `.design-sync/compiled.css` — a **snapshot** of the app's compiled stylesheet
  (`dist/assets/index-*.css` from `vite build`), with the app's Google Fonts
  `@import` prepended so rendered designs get Inter/Roboto/Roboto Mono.
- **Fonts**: Inter/Roboto/Roboto Mono load from Google Fonts at runtime (remote
  `@import`, registers as `[FONT_REMOTE]`). Material Symbols (icon font) ships a
  local woff2 via `cfg.extraFonts` → `node_modules/material-symbols/rounded.css`.

## Environment
- **Not a git repo** — durable files (`.design-sync/config.json`, `NOTES.md`,
  `conventions.md`, `previews/`, `entry.tsx`, `compiled.css`) are not committed.
  Offer `git init` at the end if the user wants version control.
- **Upload is local-only this run** — DesignSync auth needs an interactive
  `/design-login` unavailable in the VSCode extension session. Build produces
  `ds-bundle/` for the user to upload themselves (or re-run in an interactive
  terminal after `/design-login`).

## Per-component notes
- **CompanyLogo** hardcodes `<img src="/logo-full.png">`. The build ships
  `public/logo-full.png` copied to `ds-bundle/logo-full.png` so the preview
  resolves it locally. **On upload, also upload `logo-full.png` to the Claude
  Design project root** or the logo card (and any design using CompanyLogo) shows
  broken-image alt text. Re-copy after every rebuild: `cp public/logo-full.png ds-bundle/logo-full.png`.
- **Toast** ships only the `warn` tone. The base/`success` tone renders as a pale
  pill in static capture (dark navy `--color-slate-900` bg + `--color-white` text
  are both defined, so the cause is likely the frosted `backdrop-filter`
  compositing in headless chromium). Warn tone renders perfectly. Worth revisiting.
- **Overlays** (`Modal`, `Toast`, `ButtonHintPopover`) portal to `document.body`,
  so they need `cfg.overrides.<Name> = {cardMode:"single", viewport:"WxH"}` to be
  captured (the viewport is what gets screenshotted). Set in config.
- **OverflowActionMenu** open state is interaction-driven (click) — the preview
  shows the closed trigger in a row; the menu list can't render statically.
- **VerificationModal** ships the **floor card** (no authored preview). It loads
  its data from the live project API with no injectable loader, so a static
  render is just an empty modal shell. It remains fully importable; author a
  preview later if a data seam is added (e.g. an injectable `loadVerify` prop).
- **DashboardShell / shell components** need react-router (`MemoryRouter`, in the
  provider) AND a signed-in user — its preview seeds `useAuthStore.setState(...)`.
- **ReportPreviewModal** has an injectable `loadReport` prop — the preview feeds
  it fake `CompletionReportData`. Same pattern for any future API-backed modal.

## Known render warns (triaged legitimate)
- `[TOKENS_MISSING]`: `--color-surface-variant-hover`, `--color-border`,
  `--color-primary-rgb`, `--color-warning-border` — undefined in the app's own
  compiled CSS too (pre-existing fallbacks), not a sync regression.
- `[FONT_REMOTE]`: Inter / Roboto / Roboto Mono — loaded via Google Fonts
  `@import` at runtime. Expected.
- `[RENDER_THIN]` on **Modal** and **ReportPreviewModal** — "rendered height 0px".
  Benign: both portal to `document.body`, so the card root measures 0 even though
  the overlay renders perfectly (verified screenshots). Inherent to portals; do
  not "fix". `cardMode:single`+viewport captures them correctly.
- `[GRID_OVERFLOW]` on Button/SectionHeader/Skeleton — resolved by
  `cfg.overrides.<Name> = {cardMode:"column"}` (full-width-per-story cards).

## Re-sync risks (watch-list)
- `.design-sync/compiled.css` is a **snapshot** of the compiled Tailwind CSS. If
  component styling changes, regenerate it: `npx vite build` then
  `cp dist/assets/index-*.css .design-sync/compiled.css` and re-prepend the Google
  Fonts `@import` (or re-run the prepend step). A stale snapshot = missing utility
  classes in previews.
- The heavier domain components (`CableSchematic` [Three.js canvas],
  `CompletionReport`, `ReportPreviewModal` [API polling], `VerificationModal`
  [WebAuthn]) may not render statically and may fall back to floor cards — that is
  honest, not a failure.
