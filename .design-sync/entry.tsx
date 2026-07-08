// design-sync entry barrel for DWES.
// The DWES app is not a published component library, so there is no dist/ with a
// named-export entry. This barrel re-exports every scoped reusable primitive under
// a NAMED export so esbuild can assign each to window.DWES.<Name>. Many DWES
// components are `export default`, which `export * from` would NOT surface — hence
// the explicit `default as` re-exports below.
//
// Paths are relative to this file (.design-sync/entry.tsx); `..` is the repo root.

/* ── provider + preview harness helpers (not cards; referenced by cfg.provider
   and by previews that need to seed app state) ──
   ThemeProvider: the app's real theming wrapper — sets data-theme="arctic" +
   data-mode on <html> and supplies the useTheme() context ThemeToggle reads.
   MemoryRouter: router context for shell components (Topbar uses useNavigate).
   useAuthStore: lets a preview seed a signed-in user for shell components. */
export { default as ThemeProvider, useTheme, APP_THEME } from '../src/components/layout/ThemeProvider';
export { MemoryRouter } from 'react-router-dom';
export { useAuthStore } from '../src/store/useAuthStore';

/* ── default-export components → named re-export ── */
export { default as Badge } from '../src/components/Badge';
export { default as Modal } from '../src/components/Modal';
export { default as KpiCard } from '../src/components/ui/KpiCard';
export { default as SectionHeader } from '../src/components/ui/SectionHeader';
export { default as Toast } from '../src/components/ui/Toast';
export { default as ThemeToggle } from '../src/components/ui/ThemeToggle';
export { default as ButtonHintPopover } from '../src/components/ui/ButtonHintPopover';
export { default as OverflowActionMenu } from '../src/components/ui/OverflowActionMenu';
export { default as CompanyLogo } from '../src/components/ui/CompanyLogo';
export { default as DashboardShell } from '../src/components/ui/DashboardShell';
export { default as ProjectInfoCard } from '../src/components/ui/ProjectInfoCard';
export { default as CableSchematic } from '../src/components/ui/CableSchematic';
export { default as CompletionReport } from '../src/components/ui/CompletionReport';
export { default as ReportPreviewModal } from '../src/components/ui/ReportPreviewModal';
export { default as VerificationModal } from '../src/components/ui/VerificationModal';

/* ── named-export files (star re-export brings the component + its helpers) ── */
export * from '../src/components/ui/Button';       // Button
export * from '../src/components/ui/Card';         // Card, CardHeader, CardTitle, CardBody, CardBodySm, CardContent
export * from '../src/components/ui/DataTable';    // DataTable (named generic)
export * from '../src/components/ui/EmptyState';   // EmptyState, EmptyStateIllustration
export * from '../src/components/ui/Icon';         // Icon
export * from '../src/components/ui/Input';        // Input
export * from '../src/components/ui/Skeleton';     // Skeleton, SkeletonCard, SkeletonTable, SkeletonKpi, SkeletonList
export * from '../src/components/ui/Form';         // FormGroup, FormLabel, FormInput, FormSelect, FormTextarea, FormError
export * from '../src/components/ui/TabletFields'; // InputField, ComboField, SelectField
