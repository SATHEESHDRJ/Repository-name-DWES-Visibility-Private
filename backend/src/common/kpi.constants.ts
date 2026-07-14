/** Centralized DWES KPI weighting — wiring 70% / QC 30%. */
export const KPI_WIRING_WEIGHT = 0.7;
export const KPI_QC_WEIGHT = 0.3;

/**
 * Canonical panel KPI used by every DWES management view and report.
 * Precision is one decimal so partial panel progress is not hidden.
 */
export function assignedCableKpiPercent(completedAssignedCables: number, totalAssignedCables: number): number {
  if (!totalAssignedCables || totalAssignedCables <= 0) return 0;
  const completed = Math.max(0, Math.min(completedAssignedCables, totalAssignedCables));
  return Math.round((completed / totalAssignedCables) * 1000) / 10;
}

export function wiringKpiPercent(srcDone: number, dstDone: number, cablesTotal: number): number {
  if (!cablesTotal || cablesTotal <= 0) return 0;
  return Math.round(((srcDone + dstDone) / (cablesTotal * 2)) * 100);
}

export function compositeKpiPercent(wiringKpi: number, qcPassRate: number): number {
  if (wiringKpi > 0 && qcPassRate > 0) {
    return Math.round(wiringKpi * KPI_WIRING_WEIGHT + qcPassRate * KPI_QC_WEIGHT);
  }
  return wiringKpi || qcPassRate || 0;
}
