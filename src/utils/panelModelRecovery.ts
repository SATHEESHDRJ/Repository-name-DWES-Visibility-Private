export type PanelDimensionKey = 'width' | 'height' | 'depth';

export type PanelDimensionValues = Record<PanelDimensionKey, string>;
export type PanelDimensionErrors = Partial<Record<PanelDimensionKey, string>>;

export const PANEL_DIMENSION_MIN_MM = 100;
export const PANEL_DIMENSION_MAX_MM = 6000;

const DIMENSION_LABELS: Record<PanelDimensionKey, string> = {
  width: 'Width',
  height: 'Height',
  depth: 'Depth',
};

export function validatePanelDimensions(values: PanelDimensionValues): {
  errors: PanelDimensionErrors;
  normalized: Partial<Record<PanelDimensionKey, number>>;
} {
  const errors: PanelDimensionErrors = {};
  const normalized: Partial<Record<PanelDimensionKey, number>> = {};

  (Object.keys(DIMENSION_LABELS) as PanelDimensionKey[]).forEach(key => {
    const raw = values[key].trim();
    const label = DIMENSION_LABELS[key];
    if (!raw) {
      errors[key] = `${label} is required.`;
      return;
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors[key] = `${label} must be a valid number.`;
      return;
    }
    if (value < PANEL_DIMENSION_MIN_MM || value > PANEL_DIMENSION_MAX_MM) {
      errors[key] = `${label} must be between ${PANEL_DIMENSION_MIN_MM} and ${PANEL_DIMENSION_MAX_MM} mm.`;
      return;
    }
    normalized[key] = value;
  });

  return { errors, normalized };
}

export function firstInvalidPanelDimension(values: PanelDimensionValues): PanelDimensionKey | null {
  const { errors } = validatePanelDimensions(values);
  return (['width', 'height', 'depth'] as PanelDimensionKey[]).find(key => Boolean(errors[key])) ?? null;
}
