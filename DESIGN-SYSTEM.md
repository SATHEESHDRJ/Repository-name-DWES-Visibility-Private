# DWES Design System - Premium Tablet Experience

## Overview
This design system is optimized for 10-13 inch tablets in both landscape and portrait orientations, following 2026 enterprise SaaS design trends with Material Design 3 principles.

## Design Principles
- **Touch-First**: Minimum 44px touch targets, glove-friendly controls
- **Clarity**: High contrast (WCAG AA), clear visual hierarchy
- **Efficiency**: Information-dense but breathable layouts
- **Consistency**: Unified spacing, typography, and component behavior
- **Polish**: Smooth animations, micro-interactions, loading states

## Spacing System (8-Point Scale)
```
--spacing-0:   0px
--spacing-1:   8px    (0.5rem)
--spacing-2:   16px   (1rem)
--spacing-3:   24px   (1.5rem)
--spacing-4:   32px   (2rem)
--spacing-5:   40px   (2.5rem)
--spacing-6:   48px   (3rem)
--spacing-7:   56px   (3.5rem)
--spacing-8:   64px   (4rem)
--spacing-10:  80px   (5rem)
--spacing-12:  96px   (6rem)
--spacing-16: 128px  (8rem)
--spacing-24: 192px  (12rem)
```

**Usage Guidelines:**
- Component padding: 16-24px
- Section spacing: 32-48px
- Page margins: 24-32px (tablet portrait), 32-48px (landscape)
- Gap between elements: 8-16px

## Typography Scale

### Font Families
- **Primary**: Inter, Roboto, system-ui (sans-serif)
- **Monospace**: Roboto Mono, JetBrains Mono (for code/numbers)

### Font Sizes (Tablet Optimized)
```
--text-xs:     0.75rem   (12px) - Labels, captions
--text-sm:     0.875rem  (14px) - Secondary text, form labels
--text-base:   1rem      (16px) - Body text, buttons
--text-lg:     1.125rem  (18px) - Emphasized text
--text-xl:     1.25rem   (20px) - Subheadings
--text-2xl:    1.5rem    (24px) - Card titles
--text-3xl:    1.875rem  (30px) - Section headings
--text-4xl:    2.25rem   (36px) - Page titles
--text-5xl:    3rem      (48px) - Hero titles
```

### Line Heights
```
--leading-none:    1      - Tight headings
--leading-tight:   1.25   - Headings
--leading-snug:    1.375  - Subheadings
--leading-normal:  1.5    - Body text
--leading-relaxed: 1.625  - Long-form content
```

### Font Weights
```
--font-light:    300  - Display text
--font-normal:   400  - Body text
--font-medium:   500  - Emphasized text
--font-semibold: 600  - Headings, labels
--font-bold:     700  - Strong emphasis
```

### Letter Spacing
```
--tracking-tighter: -0.05em  - Large headings
--tracking-tight:   -0.025em - Headings
--tracking-normal:  0        - Body text
--tracking-wide:    0.025em  - Labels, buttons
--tracking-wider:   0.05em   - Uppercase text
```

## Color System (Material Design 3)

### Primary Colors
```
--color-primary-50:  #EFF6FF
--color-primary-100: #DBEAFE
--color-primary-200: #BFDBFE
--color-primary-300: #93C5FD
--color-primary-400: #60A5FA
--color-primary-500: #3B82F6
--color-primary-600: #2563EB  (Primary brand)
--color-primary-700: #1D4ED8
--color-primary-800: #1E40AF
--color-primary-900: #1E3A8A
```

### Semantic Colors
```
--color-success:    #059669  (Emerald 600)
--color-success-bg: #D1FAE5  (Emerald 100)
--color-warning:    #D97706  (Amber 600)
--color-warning-bg: #FEF3C7  (Amber 100)
--color-error:      #DC2626  (Red 600)
--color-error-bg:    #FEE2E2  (Red 100)
--color-info:       #0284C7  (Sky 600)
--color-info-bg:    #E0F2FE  (Sky 100)
```

### Neutral Colors
```
--color-gray-50:  #F9FAFB
--color-gray-100: #F3F4F6
--color-gray-200: #E5E7EB
--color-gray-300: #D1D5DB
--color-gray-400: #9CA3AF
--color-gray-500: #6B7280
--color-gray-600: #4B5563
--color-gray-700: #374151
--color-gray-800: #1F2937
--color-gray-900: #111827
```

### Surface Colors (Light Mode)
```
--color-background:       #F8FAFC
--color-background-alt:   #F1F5F9
--color-surface:          #FFFFFF
--color-surface-elevated: #FFFFFF
--color-surface-overlay:  rgba(255, 255, 255, 0.95)
```

### Text Colors (Light Mode)
```
--color-text-primary:   #0F172A  (16.17:1 contrast)
--color-text-secondary: #475569  (7.03:1 contrast)
--color-text-tertiary:  #94A3B8  (3.97:1 contrast)
--color-text-disabled:  #CBD5E1
--color-text-inverse:    #FFFFFF
```

### Border Colors
```
--color-border-light:  #E2E8F0
--color-border-medium: #CBD5E1
--color-border-dark:   #94A3B8
```

## Border Radius
```
--radius-sm:   8px   (Small elements)
--radius-md:   12px  (Cards, inputs)
--radius-lg:   16px  (Large cards)
--radius-xl:   24px  (Modals, panels)
--radius-full: 9999px (Pills, badges)
```

## Shadows
```
--shadow-xs:   0 1px 2px 0 rgba(0, 0, 0, 0.05)
--shadow-sm:   0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)
--shadow-md:   0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)
--shadow-lg:   0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)
--shadow-xl:   0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)
--shadow-2xl:  0 25px 50px -12px rgba(0, 0, 0, 0.25)
--shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)
```

## Transitions & Animations
```
--transition-fast:     150ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-base:     200ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-slow:     300ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-slower:   500ms cubic-bezier(0.4, 0, 0.2, 1)
--ease-out-back:       cubic-bezier(0.34, 1.56, 0.64, 1)
--ease-in-out:         cubic-bezier(0.4, 0, 0.2, 1)
--ease-spring:         cubic-bezier(0.175, 0.885, 0.32, 1.275)
```

## Z-Index Scale
```
--z-dropdown:    1000
--z-sticky:      1020
--z-fixed:       1030
--z-modal-back:  1040
--z-modal:       1050
--z-popover:     1060
--z-tooltip:     1070
```

## Breakpoints (Tablet-First)
```
--breakpoint-mobile:      375px
--breakpoint-tablet-port: 768px   (Portrait)
--breakpoint-tablet-land: 1024px  (Landscape)
--breakpoint-tablet-wide: 1280px  (Wide landscape)
--breakpoint-tablet-xl:   1440px  (Extra wide)
```

## Component Guidelines

### Touch Targets
- **Minimum**: 44px × 44px (tablet portrait)
- **Recommended**: 48px × 48px (tablet landscape)
- **Glove-friendly**: 64px × 64px (critical actions)

### Cards
- **Border radius**: 12-16px
- **Padding**: 16-24px
- **Shadow**: sm-md
- **Background**: Surface color
- **Border**: 1px solid border-light

### Buttons
- **Height**: 44px (portrait), 48px (landscape)
- **Border radius**: 8-12px
- **Padding**: 12-20px horizontal
- **Font weight**: 500-600
- **Transition**: 150-200ms

### Inputs
- **Height**: 44px (portrait), 48px (landscape)
- **Border radius**: 8-12px
- **Padding**: 12-16px horizontal
- **Border**: 1px solid border-medium
- **Focus**: Primary color ring

### Tables
- **Row height**: 52-64px
- **Cell padding**: 12-16px
- **Header background**: Surface-variant
- **Border**: 1px solid border-light
- **Sticky header**: Enabled for long tables

### Modals
- **Border radius**: 16-24px
- **Padding**: 24-32px
- **Max width**: 90vw (portrait), 600px (landscape)
- **Shadow**: xl-2xl

### Badges
- **Height**: 20-24px
- **Border radius**: Full
- **Padding**: 4-12px horizontal
- **Font size**: 11px

## Accessibility
- **Contrast ratio**: Minimum 4.5:1 for normal text, 3:1 for large text
- **Focus indicators**: Visible 2px ring on focus
- **Keyboard navigation**: Full keyboard support
- **Screen readers**: Proper ARIA labels
- **Touch targets**: Minimum 44px

## Dark Mode
Dark mode uses the same semantic color tokens with adjusted surface colors:
```
--color-background:         #15181C
--color-surface:            #1B1F24
--color-surface-variant:    #22272E
--color-surface-container:  #1E232A
--color-on-surface:         #E6EAF0
--color-on-surface-variant: #9AA5B1
```

## Animation Guidelines
- **Duration**: 150-300ms for UI transitions
- **Easing**: cubic-bezier(0.4, 0, 0.2, 1) for natural feel
- **Performance**: Use transform and opacity for smooth animations
- **Feedback**: Immediate feedback on touch (<100ms)
- **Loading**: Skeleton screens with shimmer effect

## Responsive Behavior
- **Portrait (768px)**: Stacked layouts, larger touch targets
- **Landscape (1024px)**: Side-by-side layouts, optimized density
- **Wide (1280px+)**: Maximum information density
