import type { DetectionConfidence } from './expected-headers';
import type { PdfHeaderHit, PdfTextHitKind } from './pdf-text-layer';
import { isPhysicalStripKind } from './pdf-text-layer';
import { isLiveTbEligibleView, isLiveTbRejectedView } from './live-tb-view-classification';
import { agentDebugLog } from './live-tb-debug';

/**
 * Excel ∧ GA cross-verification for a single expected TB header.
 * LIVE TB success = unique rear/internal physical TB header group + strip bbox.
 * Exact terminal-cell geometry is optional evidence only — never required for HIGH.
 */
export function crossVerifyTbHeader(input: {
  header: string;
  hits: PdfHeaderHit[];
  scheduleTerminals: string[];
  terminalRangeFound: boolean;
  terminalRange: string;
  hasGlyphBox: boolean;
  peers: number;
}): {
  confidence: DetectionConfidence;
  reasons: string[];
  usableHits: PdfHeaderHit[];
  kindSummary: PdfTextHitKind[];
} {
  const reasons: string[] = [];
  const kinds = [...new Set(input.hits.map(h => h.kind))];
  const focus = ['X9', 'X321'].includes(String(input.header || '').toUpperCase());
  const finish = (result: {
    confidence: DetectionConfidence;
    reasons: string[];
    usableHits: PdfHeaderHit[];
    kindSummary: PdfTextHitKind[];
  }) => {
    // #region agent log
    if (focus) {
      agentDebugLog(
        'excel-ga-cross-verify.ts:crossVerifyTbHeader',
        'Cross-verify decision for focus header',
        {
          header: input.header,
          confidence: result.confidence,
          reasons: result.reasons,
          kinds: result.kindSummary,
          hitViews: input.hits.map((h) => h.viewClassification),
          hitKinds: input.hits.map((h) => h.kind),
          cellCounts: input.hits.map((h) => (h.terminalCells || []).length),
          scheduleTerminals: input.scheduleTerminals,
          terminalRange: input.terminalRange,
          hasGlyphBox: input.hasGlyphBox,
          peers: input.peers,
          usable: result.usableHits.length,
        },
        'B,C,D',
      );
    }
    // #endregion
    return result;
  };

  const eligibleHits = input.hits.filter(h => {
    if (!isPhysicalStripKind(h.kind)) return false;
    if (isLiveTbRejectedView(h.viewClassification)) return false;
    return isLiveTbEligibleView(h.viewClassification);
  });

  const stripHits = input.hits.filter(h => isPhysicalStripKind(h.kind));
  const nonPhysical = input.hits.filter(h => !isPhysicalStripKind(h.kind));
  const rejectedView = stripHits.filter(h => isLiveTbRejectedView(h.viewClassification));

  if (!input.hits.length) {
    return finish({
      confidence: 'LOW',
      reasons: ['No drawing text hit for expected schedule TB header'],
      usableHits: [],
      kindSummary: kinds,
    });
  }

  if (!stripHits.length) {
    reasons.push(
      `Drawing hit(s) are non-physical (${nonPhysical.map(h => h.kind).join(',') || 'unknown'})`,
    );
    return finish({
      confidence: 'LOW',
      reasons,
      usableHits: [],
      kindSummary: kinds,
    });
  }

  if (rejectedView.length && !eligibleHits.length) {
    reasons.push(
      `Physical-looking hits are in rejected views (${[...new Set(rejectedView.map(h => h.viewClassification))].join(',')})`,
    );
    return finish({
      confidence: 'LOW',
      reasons,
      usableHits: [],
      kindSummary: kinds,
    });
  }

  if (!eligibleHits.length) {
    reasons.push(
      `No rear/internal PHYSICAL_TB_BANK hit (views: ${[...new Set(stripHits.map(h => h.viewClassification))].join(',')})`,
    );
    return finish({
      confidence: 'MEDIUM',
      reasons,
      usableHits: stripHits,
      kindSummary: kinds,
    });
  }

  if (!input.hasGlyphBox) {
    reasons.push('Physical-strip hit lacks glyph bounding box');
    return finish({
      confidence: 'MEDIUM',
      reasons,
      usableHits: eligibleHits,
      kindSummary: kinds,
    });
  }

  if (input.peers > 0 && eligibleHits.length > 1) {
    reasons.push(`Ambiguous: ${eligibleHits.length} eligible physical-strip peers`);
    return finish({
      confidence: 'AMBIGUOUS',
      reasons,
      usableHits: eligibleHits,
      kindSummary: kinds,
    });
  }

  reasons.push('Expected schedule header matches rear/internal physical TB group');
  reasons.push(`view=${eligibleHits[0].viewClassification}`);

  const cells = eligibleHits[0].terminalCells || [];
  if (cells.length) {
    reasons.push(`Optional terminal-cell evidence: ${cells.length} labels near strip`);
  }
  if (input.terminalRangeFound && input.terminalRange) {
    reasons.push(`Optional drawing terminal range ${input.terminalRange}`);
  }
  if (input.scheduleTerminals.length) {
    reasons.push(
      `Schedule terminals [${input.scheduleTerminals.join(',')}] shown as text only — not required for HIGH`,
    );
  }

  reasons.push('Excel–GA cross-verification passed (rear/internal TB header group)');
  return finish({
    confidence: 'HIGH',
    reasons,
    usableHits: eligibleHits.slice(0, 1),
    kindSummary: kinds,
  });
}
