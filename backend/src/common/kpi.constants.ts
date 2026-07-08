/** Centralized DWES KPI weighting — wiring 70% / QC 30%. */
export const KPI_WIRING_WEIGHT = 0.7;
export const KPI_QC_WEIGHT = 0.3;

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
